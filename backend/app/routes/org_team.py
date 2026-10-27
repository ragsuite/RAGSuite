"""CE platform team-admin routes — always mounted, no organization entitlement.

Member role and project ACL remain Enterprise-gated inside ``app.services.org_team``.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.auth import get_password_hash, require_org_admin, verify_password
from app.db import get_db
from app.models import InviteStatus, OrganizationMember, User
from app.schemas import (
    InviteSetupCompleteIn,
    InviteSetupPreviewOut,
    OrgTeamCapabilitiesOut,
    OrgUserCreate,
    OrgUserListOut,
    OrgUserOut,
    OrgUserUpdate,
)
from app.services.audit_service import emit_audit
from app.services.auth_session import create_login_session_and_token
from app.services.onboarding_gate import post_auth_redirect_path
from app.services.org_invite import (
    INVITE_ALREADY_COMPLETED_MESSAGE,
    INVITE_EXPIRED_MESSAGE,
    INVITE_INVALID_MESSAGE,
    find_pending_invite_by_token,
    invite_temp_password_expired,
)
from app.services.org_team import (
    deactivate_or_remove_member,
    get_org_member,
    invite_org_member,
    list_org_members,
    organization_entitled,
    reconcile_ce_member_access,
    resolve_org_display_name,
    update_org_member,
)

router = APIRouter(prefix="/api/v1/org", tags=["Organization"])
logger = logging.getLogger(__name__)


@router.get("/capabilities", response_model=OrgTeamCapabilitiesOut)
async def get_org_team_capabilities(
    current_admin: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    """UX flags for Team Members; API still enforces Member role entitlement."""
    reconcile_ce_member_access(db)
    return OrgTeamCapabilitiesOut(member_role=organization_entitled())


@router.get("/users", response_model=OrgUserListOut)
async def list_org_users(
    is_active: Annotated[bool | None, Query()] = None,
    role: Annotated[str | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    limit: Annotated[int | None, Query(ge=1, le=100)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    current_admin: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    reconcile_ce_member_access(db)
    return list_org_members(
        db,
        current_admin,
        is_active=is_active,
        role=role,
        q=q,
        limit=limit,
        offset=offset,
    )


@router.post("/users", response_model=OrgUserOut, status_code=status.HTTP_201_CREATED)
async def create_org_user(
    payload: OrgUserCreate,
    request: Request,
    current_admin: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    reconcile_ce_member_access(db, request=request)
    new_user, _membership = invite_org_member(db, current_admin, payload, request)
    return get_org_member(db, current_admin, new_user.id)


@router.patch("/users/{user_id}", response_model=OrgUserOut)
async def update_org_user(
    user_id: int,
    payload: OrgUserUpdate,
    request: Request,
    current_admin: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    reconcile_ce_member_access(db, request=request)
    user, _membership = update_org_member(db, current_admin, user_id, payload, request)
    return get_org_member(db, current_admin, user.id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def deactivate_org_user(
    user_id: int,
    request: Request,
    current_admin: User = Depends(require_org_admin),
    db: Session = Depends(get_db),
):
    deactivate_or_remove_member(db, current_admin, user_id, request, mode="auto")
    return None


@router.get("/invite/setup", response_model=InviteSetupPreviewOut)
async def preview_invite_setup(
    token: str = Query(..., min_length=10),
    db: Session = Depends(get_db),
):
    """Public preview for invite setup page (username/email/org + expiry)."""
    row = find_pending_invite_by_token(db, token)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=INVITE_INVALID_MESSAGE)
    membership, user, org = row
    expired = invite_temp_password_expired(membership)
    if expired:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=INVITE_EXPIRED_MESSAGE)
    expires_at = membership.invite_expires_at
    if expires_at and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    display_org_name = resolve_org_display_name(db, org.id, membership.invited_by or user.id)
    return InviteSetupPreviewOut(
        username=user.username,
        email=user.email,
        organization_name=display_org_name,
        role=membership.role,
        expires_at=expires_at or datetime.now(timezone.utc),
        expired=False,
    )


@router.post("/invite/setup")
async def complete_invite_setup(
    payload: InviteSetupCompleteIn,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Complete invite setup: verify temp password, set new password, sign in."""
    row = find_pending_invite_by_token(db, payload.token)
    if not row:
        existing_user = db.query(User).filter(User.username == payload.username.strip()).first()
        if existing_user and existing_user.is_active and existing_user.provisioned_by:
            accepted_membership = (
                db.query(OrganizationMember)
                .filter(
                    OrganizationMember.user_id == existing_user.id,
                    OrganizationMember.invite_status == InviteStatus.ACCEPTED,
                )
                .first()
            )
            if accepted_membership:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=INVITE_ALREADY_COMPLETED_MESSAGE,
                )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=INVITE_INVALID_MESSAGE)
    membership, user, org = row
    if invite_temp_password_expired(membership):
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=INVITE_EXPIRED_MESSAGE)
    if payload.username.strip() != user.username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username does not match this invitation")
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect temporary password")

    now = datetime.now(timezone.utc)
    user.hashed_password = get_password_hash(payload.new_password)
    user.is_active = True
    user.must_change_password = False
    user.email_verified_at = now
    user.onboarding_completed_at = now
    user.is_admin = membership.role == "org_admin"

    membership.is_active = True
    membership.invite_status = InviteStatus.ACCEPTED
    membership.invite_token_hash = None
    membership.invite_expires_at = None
    membership.invite_activated_at = now
    membership.joined_at = now

    db.flush()
    emit_audit(
        event_type="org.user.invite.completed",
        request=request,
        user_id=user.id,
        summary=f"Invite setup completed for {user.username}",
        details={"org_id": org.id, "role": membership.role},
    )

    _, response = create_login_session_and_token(
        request,
        user,
        db,
        background_tasks,
        audit_event="org.user.invite.login",
        audit_summary=f"Invite setup sign-in for {user.username}",
    )
    payload_json = json.loads(response.body.decode("utf-8"))
    payload_json["redirect_path"] = post_auth_redirect_path(db, user.id)

    new_response = JSONResponse(content=payload_json)
    set_cookie = response.headers.get("set-cookie")
    if set_cookie:
        new_response.headers["set-cookie"] = set_cookie
    return new_response
