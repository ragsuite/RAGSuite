"""Enterprise organization member tools. Registered only when the organization module is loaded."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .access import McpActor, McpToolError, require_confirm, resolve_project_id
from .resolve import resolve_named
from .tools_platform import PREVIEW_BUILDERS, _wrap


def _as_error(exc: HTTPException) -> McpToolError:
    detail = exc.detail if isinstance(exc.detail, str) else "That member change was refused."
    code = "not_found" if exc.status_code == 404 else "bad_request"
    return McpToolError(detail, code=code)


def _services():
    from ragsuite_modules.organization.backend import services as org_services

    return org_services


def _project_uuid(db: Session, actor: McpActor, project_id: Optional[str], project_name: Optional[str]) -> uuid.UUID:
    if project_name and not project_id:
        found = resolve_named(db, actor, "project", project_name)
        if found.get("match") != "one":
            raise McpToolError(found.get("message") or "Say which project.", code=found.get("code") or "ambiguous")
        return uuid.UUID(str(found["resource"]["id"]))
    return resolve_project_id(actor, project_id)


def _member_id(db: Session, actor: McpActor, user_id: Optional[str], username: Optional[str]) -> int:
    if user_id:
        return int(user_id)
    found = resolve_named(db, actor, "member", username or "", project_id=None)
    if found.get("match") != "one":
        raise McpToolError(found.get("message") or "Say which member.", code=found.get("code") or "not_found")
    return int(found["resource"]["id"])


def list_members(limit: int = 50) -> str:
    """List people in the organization. Org admin only."""

    def _inner(db: Session, actor: McpActor, limit: int = 50):
        try:
            listed = _services().list_org_members(db, actor.user, limit=min(max(int(limit or 50), 1), 100))
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {
            "ok": True,
            "message": f"{listed.total} member(s) in this organization.",
            "total": listed.total,
            "members": [row.model_dump(mode="json") for row in listed.users],
        }

    return _wrap(_inner)(limit=limit)


def get_member(user_id: Optional[str] = None, username: Optional[str] = None) -> str:
    """Show one member. Org admin only."""

    def _inner(db: Session, actor: McpActor, user_id: Optional[str] = None, username: Optional[str] = None):
        target = _member_id(db, actor, user_id, username)
        try:
            row = _services().get_org_member(db, actor.user, target)
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {"ok": True, "message": f"{row.username} is a {row.role}.", "member": row.model_dump(mode="json")}

    return _wrap(_inner)(user_id=user_id, username=username)


def invite_member(
    username: str,
    email: str,
    role: str = "member",
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Invite a member. The response never includes a password or invite token."""

    def _inner(
        db: Session,
        actor: McpActor,
        username: str,
        email: str,
        role: str = "member",
        confirm: bool = False,
        confirmation_token: Optional[str] = None,
    ):
        require_confirm(confirm)
        payload = SimpleNamespace(
            username=username,
            email=email,
            role=role,
            send_invite_email=True,
            project_assignments=[],
        )
        try:
            user, membership = _services().invite_org_member(db, actor.user, payload, request=None)
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {
            "ok": True,
            "message": f"Invite sent to {user.email}. Sign-in details are only in that email.",
            "member": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": membership.role,
            },
        }

    return _wrap(_inner)(
        username=username,
        email=email,
        role=role,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def update_member(
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Change a member's role or active status. Cannot deactivate yourself."""

    def _inner(
        db: Session,
        actor: McpActor,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        role: Optional[str] = None,
        is_active: Optional[bool] = None,
        confirm: bool = False,
        confirmation_token: Optional[str] = None,
    ):
        require_confirm(confirm)
        target = _member_id(db, actor, user_id, username)
        fields: dict[str, Any] = {}
        if role is not None:
            fields["role"] = role
        if is_active is not None:
            fields["is_active"] = is_active
        if not fields:
            raise McpToolError("Say which role or active status to change.", code="fields_required")
        try:
            user, membership = _services().update_org_member(db, actor.user, target, fields, request=None)
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {
            "ok": True,
            "message": f"Updated {user.username}.",
            "member": {"id": user.id, "username": user.username, "role": membership.role, "is_active": user.is_active},
        }

    return _wrap(_inner)(
        user_id=user_id,
        username=username,
        role=role,
        is_active=is_active,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def deactivate_member(
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Deactivate a member. Cannot deactivate yourself."""

    def _inner(
        db: Session,
        actor: McpActor,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        confirm: bool = False,
        confirmation_token: Optional[str] = None,
    ):
        require_confirm(confirm)
        target = _member_id(db, actor, user_id, username)
        if target == actor.user.id:
            raise McpToolError("You cannot deactivate your own account.", code="bad_request")
        try:
            outcome = _services().deactivate_or_remove_member(db, actor.user, target, request=None, mode="deactivate")
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {"ok": True, "message": "Member deactivated. They can no longer sign in.", "outcome": outcome}

    return _wrap(_inner)(
        user_id=user_id,
        username=username,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def remove_member(
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Remove a member who is already inactive."""

    def _inner(
        db: Session,
        actor: McpActor,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        confirm: bool = False,
        confirmation_token: Optional[str] = None,
    ):
        require_confirm(confirm)
        target = _member_id(db, actor, user_id, username)
        if target == actor.user.id:
            raise McpToolError("You cannot remove your own account.", code="bad_request")
        try:
            outcome = _services().deactivate_or_remove_member(db, actor.user, target, request=None, mode="remove")
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {"ok": True, "message": "Member removed from the organization.", "outcome": outcome}

    return _wrap(_inner)(
        user_id=user_id,
        username=username,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def get_member_project_access(user_id: Optional[str] = None, username: Optional[str] = None) -> str:
    """Show which projects a member can open."""

    def _inner(db: Session, actor: McpActor, user_id: Optional[str] = None, username: Optional[str] = None):
        target = _member_id(db, actor, user_id, username)
        try:
            access = _services().member_project_access(db, actor.user, target)
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {"ok": True, "message": "Project access for this member.", "access": access.model_dump(mode="json")}

    return _wrap(_inner)(user_id=user_id, username=username)


def grant_project_access(
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
    permissions_json: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Give a member access to one project."""

    def _inner(
        db: Session,
        actor: McpActor,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        project_id: Optional[str] = None,
        project_name: Optional[str] = None,
        permissions_json: Optional[str] = None,
        confirm: bool = False,
        confirmation_token: Optional[str] = None,
    ):
        import json as _json

        require_confirm(confirm)
        target = _member_id(db, actor, user_id, username)
        pid = _project_uuid(db, actor, project_id, project_name)
        permissions = None
        if permissions_json:
            permissions = _json.loads(permissions_json)
        try:
            outcome = _services().set_member_project_access(
                db, actor.user, target, pid, grant=True, permissions=permissions, request=None
            )
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {"ok": True, "message": "Project access granted.", "outcome": outcome, "project_id": str(pid)}

    return _wrap(_inner)(
        user_id=user_id,
        username=username,
        project_id=project_id,
        project_name=project_name,
        permissions_json=permissions_json,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def revoke_project_access(
    user_id: Optional[str] = None,
    username: Optional[str] = None,
    project_id: Optional[str] = None,
    project_name: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Remove a member's access to one project."""

    def _inner(
        db: Session,
        actor: McpActor,
        user_id: Optional[str] = None,
        username: Optional[str] = None,
        project_id: Optional[str] = None,
        project_name: Optional[str] = None,
        confirm: bool = False,
        confirmation_token: Optional[str] = None,
    ):
        require_confirm(confirm)
        target = _member_id(db, actor, user_id, username)
        pid = _project_uuid(db, actor, project_id, project_name)
        try:
            outcome = _services().set_member_project_access(
                db, actor.user, target, pid, grant=False, request=None
            )
        except HTTPException as exc:
            raise _as_error(exc) from exc
        return {"ok": True, "message": "Project access removed.", "outcome": outcome, "project_id": str(pid)}

    return _wrap(_inner)(
        user_id=user_id,
        username=username,
        project_id=project_id,
        project_name=project_name,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def _invite_preview(_db, _actor, arguments: dict) -> dict:
    return {
        "summary": (
            f"Invite {arguments.get('username')} ({arguments.get('email')}) as {arguments.get('role') or 'member'}. "
            "The email will contain the sign-in details. This preview does not include a password."
        )
    }


PREVIEW_BUILDERS["invite_member"] = _invite_preview

ADMIN_TOOLS = [
    (list_members, "list_members", "List organization members."),
    (get_member, "get_member", "Show one member."),
    (invite_member, "invite_member", "Invite a member."),
    (update_member, "update_member", "Update a member."),
    (deactivate_member, "deactivate_member", "Deactivate a member."),
    (remove_member, "remove_member", "Remove an inactive member."),
    (get_member_project_access, "get_member_project_access", "Show a member's project access."),
    (grant_project_access, "grant_project_access", "Grant project access."),
    (revoke_project_access, "revoke_project_access", "Revoke project access."),
]
