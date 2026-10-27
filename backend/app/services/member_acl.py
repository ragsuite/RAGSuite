"""Effective Member project ACL from user groups (union of grants).

Org admins bypass this layer. ``project_members`` is no longer the source of
truth for Members after the group migration.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import (
    OrganizationMember,
    Project,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupProjectGrant,
)
from app.services.project_permissions import normalize_member_permissions, union_permissions


def group_name_key(name: str) -> str:
    return (name or "").strip().lower()


def member_group_grants_by_project(db: Session, user: User) -> dict[uuid.UUID, list[str]]:
    """Union of permission lists for each project the user can open via groups."""
    if not user.org_id:
        return {}
    rows = (
        db.query(UserGroupProjectGrant.project_id, UserGroupProjectGrant.permissions)
        .join(UserGroup, UserGroup.id == UserGroupProjectGrant.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .join(Project, Project.id == UserGroupProjectGrant.project_id)
        .filter(
            UserGroupMember.user_id == user.id,
            UserGroup.org_id == user.org_id,
            Project.org_id == user.org_id,
        )
        .all()
    )
    collected: dict[uuid.UUID, list[list[str]]] = defaultdict(list)
    for project_id, permissions in rows:
        collected[project_id].append(list(permissions or []))
    return {
        project_id: normalize_member_permissions(union_permissions(lists))
        for project_id, lists in collected.items()
        if lists
    }


def member_accessible_project_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(member_group_grants_by_project(db, user).keys())


def member_permissions_for_project(db: Session, user: User, project_id: uuid.UUID) -> Optional[list[str]]:
    grants = member_group_grants_by_project(db, user)
    perms = grants.get(project_id)
    return list(perms) if perms else None


def groups_for_users(db: Session, org_id: int, user_ids: Iterable[int]) -> dict[int, list[tuple[int, str]]]:
    ids = [int(uid) for uid in user_ids]
    if not ids:
        return {}
    rows = (
        db.query(UserGroupMember.user_id, UserGroup.id, UserGroup.name)
        .join(UserGroup, UserGroup.id == UserGroupMember.group_id)
        .filter(UserGroup.org_id == org_id, UserGroupMember.user_id.in_(ids))
        .order_by(UserGroup.name.asc())
        .all()
    )
    out: dict[int, list[tuple[int, str]]] = defaultdict(list)
    for user_id, group_id, name in rows:
        out[user_id].append((group_id, name))
    return out


def clear_user_group_memberships(db: Session, org_id: int, user_id: int) -> None:
    group_ids = [row[0] for row in db.query(UserGroup.id).filter(UserGroup.org_id == org_id).all()]
    if not group_ids:
        return
    db.query(UserGroupMember).filter(
        UserGroupMember.user_id == user_id,
        UserGroupMember.group_id.in_(group_ids),
    ).delete(synchronize_session=False)


def add_user_to_groups(db: Session, org_id: int, user_id: int, group_ids: Iterable[int]) -> None:
    wanted = sorted({int(gid) for gid in group_ids})
    if not wanted:
        return
    groups = (
        db.query(UserGroup)
        .filter(UserGroup.org_id == org_id, UserGroup.id.in_(wanted))
        .all()
    )
    found = {g.id for g in groups}
    missing = [gid for gid in wanted if gid not in found]
    if missing:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User group not found: {missing[0]}",
        )
    existing = {
        row[0]
        for row in db.query(UserGroupMember.group_id).filter(
            UserGroupMember.user_id == user_id,
            UserGroupMember.group_id.in_(wanted),
        ).all()
    }
    for group_id in wanted:
        if group_id in existing:
            continue
        db.add(UserGroupMember(group_id=group_id, user_id=user_id))


def grant_member_via_group(
    db: Session,
    user: User,
    project: Project,
    permissions: Iterable[str],
    *,
    group_name: Optional[str] = None,
) -> UserGroup:
    """Test helper: put ``user`` in a group that grants ``permissions`` on ``project``."""
    if not user.org_id:
        raise ValueError("user.org_id is required")
    name = (group_name or f"test-acl-{user.id}-{project.id}").strip()
    key = group_name_key(name)
    group = (
        db.query(UserGroup)
        .filter(UserGroup.org_id == user.org_id, UserGroup.name_key == key)
        .first()
    )
    if group is None:
        group = UserGroup(org_id=user.org_id, name=name, name_key=key, description="")
        db.add(group)
        db.flush()
    membership = (
        db.query(UserGroupMember)
        .filter(UserGroupMember.group_id == group.id, UserGroupMember.user_id == user.id)
        .first()
    )
    if membership is None:
        db.add(UserGroupMember(group_id=group.id, user_id=user.id))
    normalized = normalize_member_permissions(permissions)
    grant = (
        db.query(UserGroupProjectGrant)
        .filter(
            UserGroupProjectGrant.group_id == group.id,
            UserGroupProjectGrant.project_id == project.id,
        )
        .first()
    )
    if grant is None:
        db.add(
            UserGroupProjectGrant(
                group_id=group.id,
                project_id=project.id,
                permissions=normalized,
            )
        )
    else:
        grant.permissions = normalize_member_permissions(
            union_permissions([list(grant.permissions or []), normalized])
        )
    db.flush()
    return group


def require_member_role(db: Session, org_id: int, user_id: int) -> OrganizationMember:
    from fastapi import HTTPException, status

    membership = (
        db.query(OrganizationMember)
        .filter(OrganizationMember.org_id == org_id, OrganizationMember.user_id == user_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found in organization")
    role = membership.role.value if hasattr(membership.role, "value") else str(membership.role)
    if role != "member":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only Member-role users can belong to a User Group",
        )
    return membership
