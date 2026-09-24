"""Shared access helpers for MCP platform read/write tools."""
from __future__ import annotations

import json
import logging
import uuid
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Optional

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

MAX_ARG_CHARS = 65536
mcp_confirmation_ok: ContextVar[bool] = ContextVar("mcp_confirmation_ok", default=False)
mcp_request_id: ContextVar[Optional[str]] = ContextVar("mcp_request_id", default=None)
mcp_client_name: ContextVar[Optional[str]] = ContextVar("mcp_client_name", default=None)


class McpToolError(Exception):
    """Raised for expected MCP tool failures (confirm, auth, permission)."""

    def __init__(self, message: str, *, code: str = "error", extra: Optional[dict[str, Any]] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.extra = extra or {}


@dataclass
class McpActor:
    user: Any
    auth_project_id: Optional[uuid.UUID]
    api_key_id: Any
    accessible_project_ids: list[uuid.UUID]


def _db_session() -> Session:
    from app.db import SessionLocal

    return SessionLocal()


def json_ok(payload: dict[str, Any], *, friendly_name: Optional[str] = None) -> str:
    from .responses import envelope_ok

    return json.dumps(envelope_ok(payload, friendly_name=friendly_name), default=str)


def json_err(message: str, *, code: str = "error", **extra: Any) -> str:
    from .responses import envelope_err

    body = envelope_err(message, code=code, **extra)
    return json.dumps(body, default=str)


def require_confirm(confirm: Any) -> None:
    if mcp_confirmation_ok.get():
        return
    if confirm is True or confirm == "true" or confirm == 1:
        return
    raise McpToolError(
        "This change needs a clear yes before it runs.",
        code="confirm_required",
    )


def assert_arg_sizes(arguments: dict[str, Any]) -> None:
    for key, value in arguments.items():
        if isinstance(value, str) and len(value) > MAX_ARG_CHARS:
            raise McpToolError(
                f"{key} is too large to send through this connection.",
                code="payload_too_large",
            )


def load_actor(db: Session) -> McpActor:
    from app.auth import get_accessible_project_ids, is_org_admin_user
    from app.models import ProjectMember, User
    from app.services.project_permissions import union_permissions, user_can_create_project
    from .auth_asgi import get_mcp_auth

    auth = get_mcp_auth()
    if not auth.user_id:
        raise McpToolError(
            "API key has no owning user (created_by_id); cannot authorize platform tools",
            code="no_user",
        )
    user = db.query(User).filter(User.id == int(auth.user_id)).first()
    if not user:
        raise McpToolError("API key owner user not found", code="no_user")

    accessible = get_accessible_project_ids(db, user)
    raw_active = (auth.project_id or "").strip()
    active_id: Optional[uuid.UUID] = None
    if raw_active:
        try:
            active_id = uuid.UUID(raw_active)
        except (ValueError, TypeError):
            active_id = None
    return McpActor(
        user=user,
        auth_project_id=active_id,
        api_key_id=auth.api_key_id,
        accessible_project_ids=list(accessible or []),
    )


def resolve_project_id(actor: McpActor, project_id: Optional[str] = None) -> uuid.UUID:
    if not project_id:
        if actor.auth_project_id is None:
            raise McpToolError(
                "Say which project to use, or switch the active project first.",
                code="project_required",
            )
        if actor.auth_project_id not in (actor.accessible_project_ids or []):
            raise McpToolError(
                "You no longer have access to the active project. Switch to a project you can open.",
                code="forbidden_project",
            )
        return actor.auth_project_id
    try:
        pid = uuid.UUID(str(project_id).strip())
    except (ValueError, TypeError) as exc:
        raise McpToolError(f"Invalid project_id: {project_id}", code="bad_project") from exc
    if pid not in (actor.accessible_project_ids or []):
        raise McpToolError(
            "You can't open that project.",
            code="forbidden_project",
        )
    return pid


def _member_permissions(db: Session, user: Any, project_id: uuid.UUID) -> list[str]:
    from app.auth import is_org_admin_user
    from app.models import Project, ProjectMember
    from app.services.project_permissions import ALL_PROJECT_PERMISSIONS

    if is_org_admin_user(db, user):
        return sorted(ALL_PROJECT_PERMISSIONS)

    project = db.query(Project).filter(Project.id == project_id).first()
    if project and project.owner_id == user.id:
        return sorted(ALL_PROJECT_PERMISSIONS)

    member = (
        db.query(ProjectMember)
        .filter(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        .first()
    )
    return list(member.permissions or []) if member else []


def require_permission(db: Session, actor: McpActor, project_id: uuid.UUID, permission: str) -> None:
    from app.services.project_permissions import has_effective_permission

    perms = _member_permissions(db, actor.user, project_id)
    if has_effective_permission(perms, permission):
        return
    raise McpToolError(
        "You don't have permission to do that on this project.",
        code="forbidden",
        extra={"permission": permission},
    )


def can_create_project(db: Session, actor: McpActor) -> bool:
    from app.auth import is_org_admin_user
    from app.models import ProjectMember
    from app.services.project_permissions import union_permissions, user_can_create_project

    org_admin = is_org_admin_user(db, actor.user)
    if org_admin:
        return True
    memberships = (
        db.query(ProjectMember).filter(ProjectMember.user_id == actor.user.id).all()
    )
    workspace = union_permissions(m.permissions for m in memberships)
    return user_can_create_project(workspace, is_org_admin=False)


_SECRET_KEYS = {"api_key", "secret", "token", "password", "access_token", "refresh_token", "authorization"}


def _redact(value: Any) -> Any:
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if str(key).lower() in _SECRET_KEYS:
                cleaned[key] = "[redacted]"
            else:
                cleaned[key] = _redact(item)
        return cleaned
    if isinstance(value, list):
        return [_redact(item) for item in value]
    return value


def audit_mcp(
    db: Session,
    *,
    actor: McpActor,
    event_type: str,
    project_id: Optional[uuid.UUID],
    action: str,
    resource_type: str,
    resource_id: Optional[str] = None,
    summary: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    status: str = "success",
) -> None:
    try:
        from app.services.audit_service import emit_audit

        from app.services.audit_service import V1_EVENT_TYPES

        stored_event = event_type if event_type in V1_EVENT_TYPES else "mcp.action"
        safe_details = _redact(details or {})
        safe_details["via"] = "mcp"
        safe_details["mcp_event"] = event_type
        client = mcp_client_name.get()
        if client:
            safe_details["mcp_client"] = client
        emit_audit(
            event_type=stored_event,
            user_id=actor.user.id,
            project_id=project_id,
            api_key_id=actor.api_key_id,
            actor_type="api_key",
            status=status,
            resource_type=resource_type,
            resource_id=resource_id,
            summary=summary or action,
            action=action,
            details=safe_details,
            request_id=mcp_request_id.get(),
            db=db,
        )
    except Exception:
        logger.debug("MCP audit emit failed", exc_info=True)


def parse_limit(value: Any, *, default: int = 10, max_limit: int = 50) -> int:
    try:
        n = int(value if value is not None else default)
    except (TypeError, ValueError):
        n = default
    return max(1, min(n, max_limit))


def run_tool(fn):
    """Decorator: open DB, load actor, catch McpToolError → JSON."""

    def wrapper(*args, **kwargs):
        db = _db_session()
        try:
            actor = load_actor(db)
            result = fn(db, actor, *args, **kwargs)
            if isinstance(result, str):
                return result
            return json_ok(result if isinstance(result, dict) else {"result": result})
        except McpToolError as exc:
            return json_err(exc.message, code=exc.code)
        except Exception as exc:
            logger.exception("MCP platform tool failed: %s", getattr(fn, "__name__", fn))
            return json_err(str(exc))
        finally:
            db.close()

    wrapper.__name__ = getattr(fn, "__name__", "mcp_tool")
    wrapper.__doc__ = getattr(fn, "__doc__", None)
    return wrapper
