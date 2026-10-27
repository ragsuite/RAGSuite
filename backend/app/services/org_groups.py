"""Org-admin CRUD for user groups, memberships, and per-project grants."""
from __future__ import annotations

import uuid
from typing import Optional

from fastapi import HTTPException, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Project, User, UserGroup, UserGroupMember, UserGroupProjectGrant
from app.schemas import (
    OrgGroupCreate,
    OrgGroupListOut,
    OrgGroupMemberOut,
    OrgGroupMembersOut,
    OrgGroupOut,
    OrgGroupProjectsOut,
    OrgGroupUpdate,
    OrgProjectAssignment,
    OrgUserGroupRef,
)
from app.services.audit_service import emit_audit
from app.services.member_acl import (
    add_user_to_groups,
    group_name_key,
    member_group_grants_by_project,
    require_member_role,
)
from app.services.org_team import PROJECT_ACL_ENTERPRISE_MESSAGE, organization_entitled
from app.services.project_permissions import normalize_member_permissions

GROUP_ACL_GONE_MESSAGE = "Assign project access on a User Group."
GROUP_NAME_TAKEN_MESSAGE = "A group with this name already exists in the organization."


def assert_organization_entitled() -> None:
    if organization_entitled():
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=PROJECT_ACL_ENTERPRISE_MESSAGE)


def _require_group(db: Session, org_id: int, group_id: int) -> UserGroup:
    group = db.query(UserGroup).filter(UserGroup.id == group_id, UserGroup.org_id == org_id).first()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User group not found")
    return group


def _group_counts(db: Session, group_ids: list[int]) -> tuple[dict[int, int], dict[int, int]]:
    member_counts: dict[int, int] = {gid: 0 for gid in group_ids}
    project_counts: dict[int, int] = {gid: 0 for gid in group_ids}
    if not group_ids:
        return member_counts, project_counts
    for group_id, count in (
        db.query(UserGroupMember.group_id, func.count(UserGroupMember.id))
        .filter(UserGroupMember.group_id.in_(group_ids))
        .group_by(UserGroupMember.group_id)
        .all()
    ):
        member_counts[group_id] = int(count)
    for group_id, count in (
        db.query(UserGroupProjectGrant.group_id, func.count(UserGroupProjectGrant.id))
        .filter(UserGroupProjectGrant.group_id.in_(group_ids))
        .group_by(UserGroupProjectGrant.group_id)
        .all()
    ):
        project_counts[group_id] = int(count)
    return member_counts, project_counts


def _group_out(group: UserGroup, *, member_count: int = 0, project_count: int = 0) -> OrgGroupOut:
    return OrgGroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        image=group.image,
        member_count=member_count,
        project_count=project_count,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


def list_org_groups(
    db: Session,
    admin: User,
    *,
    q: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0,
) -> OrgGroupListOut:
    assert_organization_entitled()
    query = db.query(UserGroup).filter(UserGroup.org_id == admin.org_id)
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.filter(
            (func.lower(UserGroup.name).like(like)) | (func.lower(UserGroup.description).like(like))
        )
    total = query.count()
    ordered = query.order_by(UserGroup.name.asc())
    if limit is not None:
        ordered = ordered.offset(max(offset, 0)).limit(limit)
    groups = ordered.all()
    member_counts, project_counts = _group_counts(db, [g.id for g in groups])
    return OrgGroupListOut(
        groups=[
            _group_out(
                group,
                member_count=member_counts.get(group.id, 0),
                project_count=project_counts.get(group.id, 0),
            )
            for group in groups
        ],
        total=total,
    )


def create_org_group(db: Session, admin: User, payload: OrgGroupCreate, request: Optional[Request] = None) -> OrgGroupOut:
    assert_organization_entitled()
    name = (payload.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group name is required")
    key = group_name_key(name)
    existing = (
        db.query(UserGroup)
        .filter(UserGroup.org_id == admin.org_id, UserGroup.name_key == key)
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=GROUP_NAME_TAKEN_MESSAGE)
    group = UserGroup(
        org_id=admin.org_id,
        name=name,
        name_key=key,
        description=(payload.description or "").strip() or None,
        image=(payload.image or "").strip() or None,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    emit_audit(
        event_type="org.group.created",
        request=request,
        user_id=admin.id,
        summary=f"User group created: {group.name}",
        details={"group_id": group.id},
        db=db,
    )
    return _group_out(group)


def get_org_group(db: Session, admin: User, group_id: int) -> OrgGroupOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    member_counts, project_counts = _group_counts(db, [group.id])
    return _group_out(
        group,
        member_count=member_counts.get(group.id, 0),
        project_count=project_counts.get(group.id, 0),
    )


def update_org_group(
    db: Session, admin: User, group_id: int, payload: OrgGroupUpdate, request: Optional[Request] = None
) -> OrgGroupOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        name = str(data["name"]).strip()
        if not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Group name is required")
        key = group_name_key(name)
        clash = (
            db.query(UserGroup)
            .filter(
                UserGroup.org_id == admin.org_id,
                UserGroup.name_key == key,
                UserGroup.id != group.id,
            )
            .first()
        )
        if clash:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=GROUP_NAME_TAKEN_MESSAGE)
        group.name = name
        group.name_key = key
    if "description" in data:
        value = data["description"]
        group.description = (str(value).strip() if value else None) or None
    if "image" in data:
        value = data["image"]
        group.image = (str(value).strip() if value else None) or None
    db.commit()
    db.refresh(group)
    emit_audit(
        event_type="org.group.updated",
        request=request,
        user_id=admin.id,
        summary=f"User group updated: {group.name}",
        details={"group_id": group.id, "updated_fields": list(data.keys())},
        db=db,
    )
    member_counts, project_counts = _group_counts(db, [group.id])
    return _group_out(
        group,
        member_count=member_counts.get(group.id, 0),
        project_count=project_counts.get(group.id, 0),
    )


def delete_org_group(db: Session, admin: User, group_id: int, request: Optional[Request] = None) -> None:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    name = group.name
    db.delete(group)
    db.commit()
    emit_audit(
        event_type="org.group.deleted",
        request=request,
        user_id=admin.id,
        summary=f"User group deleted: {name}",
        details={"group_id": group_id},
        db=db,
    )


def list_group_members(
    db: Session, admin: User, group_id: int, *, q: Optional[str] = None
) -> OrgGroupMembersOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    query = (
        db.query(User)
        .join(UserGroupMember, UserGroupMember.user_id == User.id)
        .filter(UserGroupMember.group_id == group.id)
    )
    if q and q.strip():
        like = f"%{q.strip().lower()}%"
        query = query.filter((func.lower(User.username).like(like)) | (func.lower(User.email).like(like)))
    users = query.order_by(User.username.asc()).all()
    return OrgGroupMembersOut(
        group_id=group.id,
        members=[
            OrgGroupMemberOut(
                id=user.id,
                username=user.username,
                email=user.email,
                avatar=user.avatar,
            )
            for user in users
        ],
    )


def replace_group_members(
    db: Session, admin: User, group_id: int, user_ids: list[int], request: Optional[Request] = None
) -> OrgGroupMembersOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    wanted = sorted({int(uid) for uid in user_ids})
    for user_id in wanted:
        require_member_role(db, admin.org_id, user_id)
    db.query(UserGroupMember).filter(UserGroupMember.group_id == group.id).delete(synchronize_session=False)
    for user_id in wanted:
        db.add(UserGroupMember(group_id=group.id, user_id=user_id))
    db.commit()
    emit_audit(
        event_type="org.group.members_replaced",
        request=request,
        user_id=admin.id,
        summary=f"User group members replaced: {group.name}",
        details={"group_id": group.id, "member_count": len(wanted)},
        db=db,
    )
    return list_group_members(db, admin, group.id)


def add_group_member(
    db: Session, admin: User, group_id: int, user_id: int, request: Optional[Request] = None
) -> OrgGroupMembersOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    require_member_role(db, admin.org_id, user_id)
    existing = (
        db.query(UserGroupMember)
        .filter(UserGroupMember.group_id == group.id, UserGroupMember.user_id == user_id)
        .first()
    )
    if existing is None:
        db.add(UserGroupMember(group_id=group.id, user_id=user_id))
        db.commit()
        emit_audit(
            event_type="org.group.member_added",
            request=request,
            user_id=admin.id,
            summary=f"User {user_id} added to group {group.name}",
            details={"group_id": group.id, "target_user_id": user_id},
            db=db,
        )
    return list_group_members(db, admin, group.id)


def remove_group_member(
    db: Session, admin: User, group_id: int, user_id: int, request: Optional[Request] = None
) -> OrgGroupMembersOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    db.query(UserGroupMember).filter(
        UserGroupMember.group_id == group.id, UserGroupMember.user_id == user_id
    ).delete(synchronize_session=False)
    db.commit()
    emit_audit(
        event_type="org.group.member_removed",
        request=request,
        user_id=admin.id,
        summary=f"User {user_id} removed from group {group.name}",
        details={"group_id": group.id, "target_user_id": user_id},
        db=db,
    )
    return list_group_members(db, admin, group.id)


def list_group_projects(db: Session, admin: User, group_id: int) -> OrgGroupProjectsOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    rows = (
        db.query(UserGroupProjectGrant)
        .join(Project, Project.id == UserGroupProjectGrant.project_id)
        .filter(UserGroupProjectGrant.group_id == group.id, Project.org_id == admin.org_id)
        .all()
    )
    return OrgGroupProjectsOut(
        group_id=group.id,
        assignments=[
            OrgProjectAssignment(
                project_id=row.project_id,
                permissions=normalize_member_permissions(row.permissions or []),
            )
            for row in rows
        ],
    )


def replace_group_projects(
    db: Session,
    admin: User,
    group_id: int,
    assignments: list[OrgProjectAssignment],
    request: Optional[Request] = None,
) -> OrgGroupProjectsOut:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    db.query(UserGroupProjectGrant).filter(UserGroupProjectGrant.group_id == group.id).delete(
        synchronize_session=False
    )
    for assignment in assignments:
        project = (
            db.query(Project)
            .filter(Project.id == assignment.project_id, Project.org_id == admin.org_id)
            .first()
        )
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project not found: {assignment.project_id}",
            )
        db.add(
            UserGroupProjectGrant(
                group_id=group.id,
                project_id=project.id,
                permissions=normalize_member_permissions(assignment.permissions),
            )
        )
    db.commit()
    emit_audit(
        event_type="org.group.projects_replaced",
        request=request,
        user_id=admin.id,
        summary=f"User group project access replaced: {group.name}",
        details={"group_id": group.id, "assignment_count": len(assignments)},
        db=db,
    )
    return list_group_projects(db, admin, group.id)


def set_group_project_access(
    db: Session,
    admin: User,
    group_id: int,
    project_id: uuid.UUID,
    *,
    grant: bool,
    permissions: Optional[list] = None,
    request: Optional[Request] = None,
) -> str:
    assert_organization_entitled()
    group = _require_group(db, admin.org_id, group_id)
    project = db.query(Project).filter(Project.id == project_id, Project.org_id == admin.org_id).first()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    row = (
        db.query(UserGroupProjectGrant)
        .filter(
            UserGroupProjectGrant.group_id == group.id,
            UserGroupProjectGrant.project_id == project.id,
        )
        .first()
    )
    if grant:
        normalized = normalize_member_permissions(permissions or ["project:read"])
        if row is None:
            db.add(
                UserGroupProjectGrant(
                    group_id=group.id,
                    project_id=project.id,
                    permissions=normalized,
                )
            )
        else:
            row.permissions = normalized
        outcome = "granted"
    else:
        if row is not None:
            db.delete(row)
        outcome = "revoked"
    db.commit()
    emit_audit(
        event_type="org.group.project_access",
        request=request,
        user_id=admin.id,
        summary=f"Group {group.name} project access {outcome}",
        details={"group_id": group.id, "project_id": str(project.id), "outcome": outcome},
        db=db,
    )
    return outcome


def effective_member_assignments(db: Session, user: User) -> list[OrgProjectAssignment]:
    grants = member_group_grants_by_project(db, user)
    return [
        OrgProjectAssignment(project_id=project_id, permissions=perms)
        for project_id, perms in sorted(grants.items(), key=lambda item: str(item[0]))
    ]


def org_user_group_refs(db: Session, org_id: int, user_id: int) -> list[OrgUserGroupRef]:
    rows = (
        db.query(UserGroup.id, UserGroup.name)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .filter(UserGroup.org_id == org_id, UserGroupMember.user_id == user_id)
        .order_by(UserGroup.name.asc())
        .all()
    )
    return [OrgUserGroupRef(id=group_id, name=name) for group_id, name in rows]
