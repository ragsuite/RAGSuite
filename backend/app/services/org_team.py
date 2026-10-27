"""Organization member operations shared by the REST routes and MCP.

Invite responses never include the temporary password or the invite token.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import urlencode

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.models import (
    InviteStatus,
    Organization,
    OrganizationMember,
    Project,
    ProjectMember,
    Settings,
    User,
    UserSession,
)
from app.platform.entitlement_deps import has_feature_entitlement
from app.schemas import OrgProjectAssignment, OrgUserGroupRef, OrgUserListOut, OrgUserOut, OrgUserProjectsOut
from app.services.member_acl import add_user_to_groups, clear_user_group_memberships, groups_for_users
from app.services.audit_service import emit_audit
from app.services.frontend_origin import frontend_base_from_request_if_trusted
from app.services.org_invite import (
    INVITE_SMTP_NOT_READY_MESSAGE,
    INVITE_SMTP_SEND_FAILED_PREFIX,
    generate_temp_password,
    hash_invite_token,
    is_org_provisioned_user,
    is_reclaimable_org_provisioned_user,
)
from app.services.project_permissions import (
    normalize_member_permissions,
    normalize_workspace_permissions,
)
from app.services.transactional_email import send_org_invite_email, smtp_delivery_ready
from app.settings import settings

logger = logging.getLogger(__name__)

MEMBER_ROLE_ENTERPRISE_MESSAGE = (
    "The Member access level requires RAGSuite Enterprise. "
    "Invite team members as Admin on Community Edition, or upgrade to unlock Member."
)
MEMBER_ACTIVE_ON_CE_MESSAGE = (
    "Active Member accounts require RAGSuite Enterprise. "
    "Promote this user to Admin, or leave them Inactive until you upgrade."
)
PROJECT_ACL_ENTERPRISE_MESSAGE = (
    "Project access assignments require RAGSuite Enterprise."
)
USER_PROJECT_ACL_GONE_MESSAGE = "Assign project access on a User Group."
ORGANIZATION_ENTITLEMENT = "organization:read"


def _role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def organization_entitled() -> bool:
    """True when a valid license includes organization (Member role + project ACL)."""
    return has_feature_entitlement(ORGANIZATION_ENTITLEMENT)


def assert_can_assign_member_role(role) -> None:
    """Reject Member role without organization entitlement (CE cannot bypass via API)."""
    if _role_value(role) != "member":
        return
    if organization_entitled():
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=MEMBER_ROLE_ENTERPRISE_MESSAGE,
    )


def assert_can_assign_project_acl(assignments) -> None:
    if not assignments:
        return
    if organization_entitled():
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=PROJECT_ACL_ENTERPRISE_MESSAGE,
    )


def deactivate_members_for_ce_fallback(db: Session, *, request: Optional[Request] = None) -> int:
    """Deactivate all Member-role users when organization entitlement is absent.

    Idempotent. Does not change roles or touch org_admin users. Revokes pending
    Member invites so they cannot complete setup after CE fallback.
    """
    if organization_entitled():
        return 0

    members = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.role == "member")
        .all()
    )
    affected = 0
    for membership, user in members:
        needs_deactivate = bool(membership.is_active) or bool(user.is_active)
        is_pending = membership.invite_status == InviteStatus.PENDING
        if not needs_deactivate and not is_pending:
            continue

        if needs_deactivate:
            membership.is_active = False
            user.is_active = False
            user.is_admin = False
            db.query(UserSession).filter(
                UserSession.user_id == user.id,
                UserSession.is_active == True,  # noqa: E712
            ).update({"is_active": False})

        if is_pending or needs_deactivate:
            membership.invite_status = InviteStatus.REVOKED
            membership.invite_token_hash = None
            membership.invite_expires_at = None

        affected += 1

    if affected:
        db.commit()
        emit_audit(
            event_type="org.user.deactivated",
            request=request,
            summary=f"CE fallback: deactivated {affected} Member role user(s)",
            details={"count": affected, "reason": "organization_entitlement_absent"},
            db=db,
        )
        logger.info("CE fallback: deactivated %d Member role user(s)", affected)

    return affected


def reconcile_ce_member_access(db: Session, *, request: Optional[Request] = None) -> int:
    """Best-effort CE fallback reconcile used by routes and startup."""
    try:
        return deactivate_members_for_ce_fallback(db, request=request)
    except Exception:
        logger.exception("CE fallback Member deactivation failed")
        return 0


def _is_defaultish_org_name(value: str | None) -> bool:
    normalized = (value or "").strip().lower()
    return normalized in {"", "default organization", "default", "my organization"}


def resolve_org_display_name(db: Session, org_id: int, actor_user_id: int) -> str:
    """Prefer theme/settings org_name over organizations.name (internal label)."""
    org = db.query(Organization).filter(Organization.id == org_id).first()
    fallback = (org.name if org and org.name else None) or "Organization"

    actor_settings = db.query(Settings).filter(Settings.user_id == actor_user_id).first()
    if actor_settings and not _is_defaultish_org_name(actor_settings.org_name):
        return actor_settings.org_name.strip()

    admin_settings_rows = (
        db.query(Settings)
        .join(OrganizationMember, OrganizationMember.user_id == Settings.user_id)
        .filter(
            OrganizationMember.org_id == org_id,
            OrganizationMember.role == "org_admin",
            OrganizationMember.is_active.is_(True),
        )
        .all()
    )
    for admin_settings in admin_settings_rows:
        if not _is_defaultish_org_name(admin_settings.org_name):
            return admin_settings.org_name.strip()

    return fallback.strip()


def org_user_out(
    user: User,
    membership: OrganizationMember,
    groups: Optional[list[OrgUserGroupRef]] = None,
) -> OrgUserOut:
    return OrgUserOut(
        id=user.id,
        username=user.username,
        email=user.email,
        is_active=bool(user.is_active and membership.is_active),
        role=membership.role,
        invite_status=membership.invite_status.value if membership.invite_status else None,
        created_at=user.created_at,
        last_login=user.last_login,
        avatar=user.avatar,
        groups=list(groups or []),
    )


def _require_member(db: Session, org_id: int, user_id: int) -> tuple[OrganizationMember, User]:
    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.org_id == org_id, OrganizationMember.user_id == user_id)
        .first()
    )
    user = db.query(User).filter(User.id == user_id).first()
    if not membership or not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found in organization")
    return membership, user


def list_org_members(
    db: Session,
    admin: User,
    *,
    is_active: Optional[bool] = None,
    role: Optional[str] = None,
    q: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> OrgUserListOut:
    members_query = (
        db.query(OrganizationMember, User)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(OrganizationMember.org_id == admin.org_id)
    )
    if is_active is not None:
        members_query = members_query.filter(OrganizationMember.is_active == is_active)
    if role:
        members_query = members_query.filter(OrganizationMember.role == role)
    if q and isinstance(q, str):
        q_like = f"%{q.lower()}%"
        members_query = members_query.filter((User.username.ilike(q_like)) | (User.email.ilike(q_like)))
    members_query = members_query.filter(User.id != admin.id)
    total = members_query.count()
    ordered = members_query.order_by(User.created_at.desc())
    if limit is not None:
        ordered = ordered.offset(max(offset, 0)).limit(limit)
    rows = ordered.all()
    grouped = groups_for_users(db, admin.org_id, [user.id for _member, user in rows])
    users = [
        org_user_out(
            user,
            member,
            groups=[OrgUserGroupRef(id=gid, name=name) for gid, name in grouped.get(user.id, [])],
        )
        for member, user in rows
    ]
    return OrgUserListOut(users=users, total=total)


def get_org_member(db: Session, admin: User, user_id: int) -> OrgUserOut:
    membership, user = _require_member(db, admin.org_id, user_id)
    grouped = groups_for_users(db, admin.org_id, [user.id])
    return org_user_out(
        user,
        membership,
        groups=[OrgUserGroupRef(id=gid, name=name) for gid, name in grouped.get(user.id, [])],
    )


def _smtp_error_detail(exc: BaseException) -> str:
    text = str(exc).strip() or exc.__class__.__name__
    if len(text) > 280:
        return text[:277] + "..."
    return text


def _rollback_failed_invite(db: Session, new_user: User) -> None:
    """Remove a pending invite user when email delivery fails so the admin can retry cleanly."""
    db.delete(new_user)
    db.commit()


def invite_org_member(db: Session, admin: User, payload, request: Optional[Request] = None) -> tuple[User, OrganizationMember]:
    """Create a pending member and send the invite email. Does not return secrets."""
    org = db.query(Organization).filter(Organization.id == admin.org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    assert_can_assign_member_role(payload.role)
    group_ids = list(getattr(payload, "group_ids", None) or [])
    if group_ids:
        assert_can_assign_project_acl(group_ids)
    send_email = bool(getattr(payload, "send_invite_email", True))
    if send_email and not smtp_delivery_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=INVITE_SMTP_NOT_READY_MESSAGE,
        )
    current_member_count = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.org_id == org.id, OrganizationMember.is_active == True)  # noqa: E712
        .count()
    )
    if org.max_users > 0 and current_member_count >= org.max_users:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Organization user limit exceeded")

    existing_user = db.query(User).filter((User.username == payload.username) | (User.email == payload.email)).first()
    if existing_user:
        if is_reclaimable_org_provisioned_user(db, existing_user):
            db.delete(existing_user)
            db.flush()
        else:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")

    invite_token = secrets.token_urlsafe(32)
    seed_password = generate_temp_password()
    invite_ttl = timedelta(minutes=settings.org_invite_temp_password_ttl_minutes)
    role_value = _role_value(payload.role)

    new_user = User(
        username=payload.username,
        email=str(payload.email).strip().lower(),
        hashed_password=get_password_hash(seed_password),
        is_active=False,
        is_admin=False,
        org_id=org.id,
        provisioned_by=admin.id,
        must_change_password=True,
        auth_provider="local",
        email_verified_at=None,
    )
    db.add(new_user)
    db.flush()

    membership = OrganizationMember(
        org_id=org.id,
        user_id=new_user.id,
        role=role_value,
        is_active=False,
        invited_by=admin.id,
        invite_status=InviteStatus.PENDING,
        invite_token_hash=hash_invite_token(invite_token),
        invite_expires_at=datetime.now(timezone.utc) + invite_ttl,
        invite_activated_at=None,
        joined_at=None,
    )
    db.add(membership)
    if group_ids and role_value == "member":
        add_user_to_groups(db, org.id, new_user.id, group_ids)
    db.commit()
    db.refresh(new_user)

    if send_email:
        try:
            _send_invite(
                db,
                request,
                admin=admin,
                org=org,
                new_user=new_user,
                invite_token=invite_token,
                seed_password=seed_password,
                role_value=role_value,
            )
        except Exception as exc:
            logger.exception("Invite email failed for %s; rolling back pending member", new_user.email)
            emit_audit(
                event_type="org.user.invite.email_failed",
                request=request,
                user_id=admin.id,
                status="failure",
                summary=f"Invite email failed for {new_user.email}",
                details={"target_user_id": new_user.id, "error": str(exc)},
                db=db,
            )
            _rollback_failed_invite(db, new_user)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"{INVITE_SMTP_SEND_FAILED_PREFIX} ({_smtp_error_detail(exc)})",
            ) from exc
    emit_audit(
        event_type="org.user.created",
        request=request,
        user_id=admin.id,
        summary=f"Org user created: {new_user.username}",
        details={"target_user_id": new_user.id, "role": role_value},
        db=db,
    )
    return new_user, membership


def _send_invite(db, request, *, admin, org, new_user, invite_token, seed_password, role_value) -> None:
    frontend_base = (
        (frontend_base_from_request_if_trusted(request) if request is not None else None)
        or settings.frontend_base_url
    ).rstrip("/")
    sign_in_url = f"{frontend_base}/sign-in?{urlencode({'invite': invite_token})}"
    display_org_name = resolve_org_display_name(db, org.id, admin.id)
    if not smtp_delivery_ready():
        emit_audit(
            event_type="org.user.invite.email_skipped",
            request=request,
            user_id=admin.id,
            status="failure",
            summary=f"Invite email skipped for {new_user.email} (SMTP not ready)",
            details={"target_user_id": new_user.id},
            db=db,
        )
        logger.warning("Invite email skipped for %s: SMTP not ready", new_user.email)
        raise RuntimeError(INVITE_SMTP_NOT_READY_MESSAGE)
    send_org_invite_email(
        to_email=new_user.email,
        invited_by_username=admin.username,
        organization_name=display_org_name,
        setup_url=sign_in_url,
        username=new_user.username,
        temporary_password=seed_password,
        expires_minutes=settings.org_invite_temp_password_ttl_minutes,
        role_label=role_value,
    )


def update_org_member(db: Session, admin: User, user_id: int, payload, request: Optional[Request] = None) -> tuple[User, OrganizationMember]:
    membership, user = _require_member(db, admin.org_id, user_id)
    update_data = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else dict(payload)
    updated_fields = list(update_data.keys())
    previous_role = _role_value(membership.role)
    if "role" in update_data and update_data["role"] is not None:
        new_role = _role_value(update_data["role"])
        # Demoting Admin → Member requires Enterprise; keeping an existing Member is fine.
        if new_role == "member" and previous_role != "member":
            assert_can_assign_member_role(new_role)
        membership.role = new_role
        user.is_admin = membership.role == "org_admin"
        update_data.pop("role")
    if "is_active" in update_data and update_data["is_active"] is not None:
        is_active = bool(update_data.pop("is_active"))
        if not is_active and user.id == admin.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
        membership.is_active = is_active
        user.is_active = is_active
        membership.invite_status = InviteStatus.ACCEPTED if is_active else InviteStatus.REVOKED
        if not is_active:
            db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.is_active == True).update(  # noqa: E712
                {"is_active": False}
            )

    resulting_role = _role_value(membership.role)
    demoted_to_member = previous_role == "org_admin" and resulting_role == "member"
    promoted_to_admin = previous_role != "org_admin" and resulting_role == "org_admin"
    # CE: promoting Member → Admin restores sign-in without a separate Active toggle.
    if promoted_to_admin and (not membership.is_active or not user.is_active):
        membership.is_active = True
        user.is_active = True
        membership.invite_status = InviteStatus.ACCEPTED
        if "is_active" not in updated_fields:
            updated_fields.append("is_active")

    # Promote Member → Admin: groups no longer apply. Demote Admin → Member: start with no groups.
    if promoted_to_admin and admin.org_id:
        clear_user_group_memberships(db, admin.org_id, user.id)
    if demoted_to_member and admin.org_id:
        clear_user_group_memberships(db, admin.org_id, user.id)
        db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.is_active == True).update(  # noqa: E712
            {"is_active": False}
        )

    if "group_ids" in update_data:
        next_group_ids = list(update_data.pop("group_ids") or [])
        resulting_role_for_groups = _role_value(membership.role)
        clear_user_group_memberships(db, admin.org_id, user.id)
        if resulting_role_for_groups == "member" and next_group_ids:
            add_user_to_groups(db, admin.org_id, user.id, next_group_ids)

    # CE: never leave an Active Member account when organization entitlement is absent.
    if (
        not organization_entitled()
        and resulting_role == "member"
        and (membership.is_active or user.is_active)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=MEMBER_ACTIVE_ON_CE_MESSAGE,
        )

    for field, value in update_data.items():
        setattr(user, field, value)
    db.commit()
    emit_audit(
        event_type="org.user.role_changed",
        request=request,
        user_id=admin.id,
        summary=f"Org user updated: {user.username}",
        details={"target_user_id": user.id, "updated_fields": updated_fields},
        db=db,
    )
    return user, membership


def deactivate_or_remove_member(
    db: Session,
    admin: User,
    user_id: int,
    request: Optional[Request] = None,
    *,
    mode: str = "auto",
) -> str:
    """Deactivate, or remove an already inactive member.

    mode auto matches the REST delete: active members are deactivated, inactive members are removed.
    mode deactivate never removes. mode remove never deactivates an active member.
    """
    membership, user = _require_member(db, admin.org_id, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
    already_inactive = (not membership.is_active) or (not user.is_active)
    if mode == "deactivate":
        if already_inactive:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This member is already inactive")
        already_inactive = False
    elif mode == "remove" and not already_inactive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Deactivate this member before removing them")

    if already_inactive:
        if admin.org_id:
            clear_user_group_memberships(db, admin.org_id, user.id)
        org_project_ids = [row[0] for row in db.query(Project.id).filter(Project.org_id == admin.org_id).all()]
        if org_project_ids:
            db.query(ProjectMember).filter(
                ProjectMember.user_id == user.id,
                ProjectMember.project_id.in_(org_project_ids),
            ).delete(synchronize_session=False)
        db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.is_active == True).update(  # noqa: E712
            {"is_active": False}
        )
        should_hard_delete_user = is_org_provisioned_user(user)
        db.delete(membership)
        if should_hard_delete_user:
            db.delete(user)
        else:
            user.org_id = None
            user.is_admin = False
            user.is_active = False
        db.commit()
        emit_audit(
            event_type="org.user.deleted",
            request=request,
            user_id=admin.id,
            summary=f"Org user removed: {user.username}",
            details={"target_user_id": user.id, "hard_deleted": should_hard_delete_user},
            db=db,
        )
        return "removed"

    membership.is_active = False
    user.is_active = False
    membership.invite_status = InviteStatus.REVOKED
    db.query(UserSession).filter(UserSession.user_id == user.id, UserSession.is_active == True).update(  # noqa: E712
        {"is_active": False}
    )
    db.commit()
    emit_audit(
        event_type="org.user.deactivated",
        request=request,
        user_id=admin.id,
        summary=f"Org user deactivated: {user.username}",
        details={"target_user_id": user.id},
        db=db,
    )
    return "deactivated"


def member_project_access(db: Session, admin: User, user_id: int) -> OrgUserProjectsOut:
    _membership, user = _require_member(db, admin.org_id, user_id)
    from app.services.org_groups import effective_member_assignments

    workspace = normalize_workspace_permissions(getattr(_membership, "workspace_permissions", None) or [])
    return OrgUserProjectsOut(
        user_id=user_id,
        assignments=effective_member_assignments(db, user),
        can_create_projects="project:create" in workspace,
        workspace_permissions=workspace,
    )


def replace_member_projects(db: Session, admin: User, user_id: int, payload, request: Optional[Request] = None) -> OrgUserProjectsOut:
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=USER_PROJECT_ACL_GONE_MESSAGE,
    )


def set_member_project_access(
    db: Session,
    admin: User,
    user_id: int,
    project_id: uuid.UUID,
    *,
    grant: bool,
    permissions: Optional[list] = None,
    request: Optional[Request] = None,
) -> str:
    """Add or remove one project on top of the member's current assignments."""
    _require_member(db, admin.org_id, user_id)
    project = db.query(Project).filter(Project.id == project_id, Project.org_id == admin.org_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    row = (
        db.query(ProjectMember)
        .filter(ProjectMember.user_id == user_id, ProjectMember.project_id == project_id)
        .first()
    )
    if grant:
        normalized = normalize_member_permissions(permissions or ["project:read", "documents:manage"])
        if row is None:
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=user_id,
                    permissions=normalized,
                    granted_by=admin.id,
                )
            )
        else:
            row.permissions = normalized
            row.granted_by = admin.id
        outcome = "granted"
    else:
        if row is not None:
            db.delete(row)
        outcome = "revoked"
    db.commit()
    emit_audit(
        event_type="org.project.assigned",
        request=request,
        user_id=admin.id,
        resource_type="project_member",
        resource_id=str(project_id),
        summary=f"Project access {outcome} for user {user_id}",
        details={"target_user_id": user_id, "project_id": str(project_id), "grant": grant},
        db=db,
    )
    return outcome
