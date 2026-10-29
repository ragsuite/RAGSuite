"""Effective Member project ACL: Direct overlay on group grants.

Org admins bypass this layer. Members need a grant from Direct and/or groups.
Per-module Direct Read/Write/None overrides the group for that user only.
"""
from __future__ import annotations

import uuid
from collections import defaultdict
from typing import Iterable, Optional, TypedDict

from sqlalchemy.orm import Session

from app.models import (
    OrganizationMember,
    Project,
    ProjectMember,
    User,
    UserGroup,
    UserGroupMember,
    UserGroupProjectGrant,
)
from app.services.project_permissions import (
    MODULE_CATALOG,
    compose_direct_acl,
    module_id_from_permission,
    modules_touched_by_permissions,
    normalize_member_permissions,
    overlay_permissions,
    split_direct_acl,
    union_permissions,
)

MODULE_CATALOG_SET = frozenset(MODULE_CATALOG)


class PermissionSource(TypedDict, total=False):
    type: str
    id: int
    name: str


class DirectProjectAcl(TypedDict):
    grants: list[str]
    denied_modules: list[str]
    project_denied: bool
    raw: list[str]


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


def member_direct_acl_by_project(db: Session, user: User) -> dict[uuid.UUID, DirectProjectAcl]:
    """Direct ``project_members`` ACL (grants + denials), including deny-only rows."""
    if not user.org_id:
        return {}
    rows = (
        db.query(ProjectMember.project_id, ProjectMember.permissions)
        .join(Project, Project.id == ProjectMember.project_id)
        .filter(ProjectMember.user_id == user.id, Project.org_id == user.org_id)
        .all()
    )
    out: dict[uuid.UUID, DirectProjectAcl] = {}
    for project_id, permissions in rows:
        raw = list(permissions or [])
        acl = split_direct_acl(raw)
        if not acl["grants"] and not acl["denied_modules"] and not acl["project_denied"]:
            continue
        out[project_id] = DirectProjectAcl(
            grants=acl["grants"],
            denied_modules=acl["denied_modules"],
            project_denied=acl["project_denied"],
            raw=compose_direct_acl(
                acl["grants"],
                denied_modules=acl["denied_modules"],
                project_denied=acl["project_denied"],
            ),
        )
    return out


def member_direct_grants_by_project(db: Session, user: User) -> dict[uuid.UUID, list[str]]:
    """Positive Direct grants only (no deny tokens). Kept for callers that need grants."""
    return {
        project_id: list(acl["grants"])
        for project_id, acl in member_direct_acl_by_project(db, user).items()
        if acl["grants"]
    }


def member_effective_grants_by_project(db: Session, user: User) -> dict[uuid.UUID, list[str]]:
    """Per-module Direct overlay on group grants. Empty effective access is omitted."""
    direct = member_direct_acl_by_project(db, user)
    groups = member_group_grants_by_project(db, user)
    out: dict[uuid.UUID, list[str]] = {}
    for project_id in set(direct) | set(groups):
        acl = direct.get(project_id)
        raw = acl["raw"] if acl else []
        merged = overlay_permissions(raw, groups.get(project_id))
        if merged:
            out[project_id] = merged
    return out


def member_accessible_project_ids(db: Session, user: User) -> list[uuid.UUID]:
    return list(member_effective_grants_by_project(db, user).keys())


def member_permissions_for_project(db: Session, user: User, project_id: uuid.UUID) -> Optional[list[str]]:
    perms = member_effective_grants_by_project(db, user).get(project_id)
    return list(perms) if perms else None


def member_group_permission_sources(
    db: Session, user: User
) -> dict[uuid.UUID, dict[str, list[PermissionSource]]]:
    """Group-granted keys with group sources (no Direct overlay)."""
    if not user.org_id:
        return {}
    group_sources_by_project: dict[uuid.UUID, dict[str, list[PermissionSource]]] = defaultdict(
        lambda: defaultdict(list)
    )
    rows = (
        db.query(
            UserGroupProjectGrant.project_id,
            UserGroupProjectGrant.permissions,
            UserGroup.id,
            UserGroup.name,
        )
        .join(UserGroup, UserGroup.id == UserGroupProjectGrant.group_id)
        .join(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .join(Project, Project.id == UserGroupProjectGrant.project_id)
        .filter(
            UserGroupMember.user_id == user.id,
            UserGroup.org_id == user.org_id,
            Project.org_id == user.org_id,
        )
        .order_by(UserGroup.name.asc(), UserGroup.id.asc())
        .all()
    )
    for project_id, permissions, group_id, group_name in rows:
        for key in normalize_member_permissions(permissions or []):
            sources = group_sources_by_project[project_id][key]
            if any(src.get("type") == "group" and src.get("id") == group_id for src in sources):
                continue
            sources.append(PermissionSource(type="group", id=int(group_id), name=str(group_name)))
    return {
        project_id: {key: list(sources) for key, sources in perms.items()}
        for project_id, perms in group_sources_by_project.items()
    }


def member_effective_permissions_with_sources(
    db: Session, user: User
) -> dict[uuid.UUID, dict[str, list[PermissionSource]]]:
    """Per-project effective permission keys with Direct and/or Group sources."""
    if not user.org_id:
        return {}

    direct = member_direct_acl_by_project(db, user)
    groups = member_group_grants_by_project(db, user)
    group_sources_by_project = member_group_permission_sources(db, user)

    by_project: dict[uuid.UUID, dict[str, list[PermissionSource]]] = {}
    for project_id in set(direct) | set(groups):
        acl = direct.get(project_id)
        if acl and acl["project_denied"]:
            continue
        raw = acl["raw"] if acl else []
        effective = overlay_permissions(raw, groups.get(project_id))
        if not effective:
            continue
        direct_modules = modules_touched_by_permissions(acl["grants"] if acl else [])
        key_sources: dict[str, list[PermissionSource]] = {}
        for key in effective:
            sources: list[PermissionSource] = []
            module = module_id_from_permission(key)
            if module in MODULE_CATALOG_SET and module in direct_modules:
                sources.append(PermissionSource(type="direct"))
            elif key in (acl["grants"] if acl else []):
                sources.append(PermissionSource(type="direct"))

            for src in group_sources_by_project.get(project_id, {}).get(key, []):
                if not any(
                    existing.get("type") == "group" and existing.get("id") == src.get("id")
                    for existing in sources
                ):
                    sources.append(src)
            if module in MODULE_CATALOG_SET and module in direct_modules:
                for gkey, gsources in group_sources_by_project.get(project_id, {}).items():
                    if module_id_from_permission(gkey) != module:
                        continue
                    for src in gsources:
                        if not any(
                            existing.get("type") == "group" and existing.get("id") == src.get("id")
                            for existing in sources
                        ):
                            sources.append(src)
            key_sources[key] = sources or [PermissionSource(type="direct")]
        if key_sources:
            by_project[project_id] = key_sources
    return by_project


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
