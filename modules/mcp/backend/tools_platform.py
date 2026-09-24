"""MCP platform product tools: full CE read + safe (confirm-gated) writes."""
from __future__ import annotations

import inspect
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from .access import (
    McpActor,
    McpToolError,
    assert_arg_sizes,
    audit_mcp,
    can_create_project,
    json_err,
    json_ok,
    load_actor,
    mcp_confirmation_ok,
    parse_limit,
    require_confirm,
    require_permission,
    resolve_project_id,
    _db_session,
)
from .confirmations import consume_token, issue_token
from .idempotency import get_cached, store as store_idempotent
from .policy import policy_for

logger = logging.getLogger(__name__)


PREVIEW_BUILDERS: dict[str, Any] = {}


def _preview_body(tool_name: str, arguments: dict[str, Any], db: Session, actor: McpActor) -> dict[str, Any]:
    policy = policy_for(tool_name)
    label = policy.friendly_name if policy else tool_name
    shown = {
        key: value
        for key, value in arguments.items()
        if key not in {"confirm", "confirmation_token", "idempotency_key"} and value not in (None, "")
    }
    summary = (
        f"{label} will change RAGSuite data. Nothing has been changed yet. "
        "Ask the user to confirm this exact action, then send confirmation_token."
    )
    extra: dict[str, Any] = {}
    builder = PREVIEW_BUILDERS.get(tool_name)
    if builder:
        try:
            extra = builder(db, actor, arguments) or {}
            if extra.get("summary"):
                summary = extra["summary"]
        except McpToolError:
            raise
        except Exception:
            logger.debug("MCP preview builder failed for %s", tool_name, exc_info=True)
    return {
        "ok": False,
        "success": False,
        "requires_confirmation": True,
        "code": "confirmation_required",
        "message": summary,
        "preview": {
            "summary": summary,
            "arguments": shown,
            "resource_type": policy.resource_type if policy else "",
            **{k: v for k, v in extra.items() if k != "summary"},
        },
        "next_step": "Show this preview. Call the same tool again with confirmation_token only after the user agrees.",
    }


def _wrap(fn):
    """Run fn(db, actor, **kwargs) with policy, confirmation, idempotency, and a human envelope."""

    def _exec(**kwargs):
        db = _db_session()
        token_ctx = None
        tool_name = ""
        frame = inspect.currentframe()
        caller = frame.f_back if frame else None
        if caller:
            tool_name = caller.f_code.co_name
        policy = policy_for(tool_name)
        idem_key = kwargs.pop("idempotency_key", None)
        confirmation_token = kwargs.pop("confirmation_token", None)
        try:
            assert_arg_sizes({**kwargs, "idempotency_key": idem_key or "", "confirmation_token": confirmation_token or ""})
            actor = load_actor(db)
            if policy and policy.entitlement:
                from app.platform.ee_feature_gate import enterprise_feature_denial

                locked = enterprise_feature_denial(policy.entitlement)
                if locked:
                    raise McpToolError(
                        locked["message"],
                        code="entitlement",
                        extra={"enterprise_locked": True, "feature": locked["feature"]},
                    )
            if policy and policy.org_admin:
                from app.auth import is_org_admin_user

                if not is_org_admin_user(db, actor.user):
                    raise McpToolError("Only an organization admin can do that.", code="not_org_admin")
            if policy and policy.needs_token:
                bound = {**kwargs, "confirm": kwargs.get("confirm", False)}
                if not confirmation_token:
                    preview = _preview_body(tool_name, bound, db, actor)
                    issued, ttl = issue_token(
                        api_key_id=actor.api_key_id,
                        user_id=actor.user.id,
                        tool=tool_name,
                        arguments=bound,
                    )
                    preview["confirmation_token"] = issued
                    preview["expires_at"] = (
                        datetime.now(timezone.utc) + timedelta(seconds=ttl)
                    ).isoformat()
                    audit_mcp(
                        db,
                        actor=actor,
                        event_type=(policy.audit_event or "mcp.action"),
                        project_id=None,
                        action=tool_name,
                        resource_type=policy.resource_type or "mcp",
                        summary=f"Preview {policy.friendly_name}",
                        details={"confirmation": "preview"},
                        status="success",
                    )
                    return json_ok(preview, friendly_name=policy.friendly_name)
                try:
                    consume_token(
                        confirmation_token,
                        api_key_id=actor.api_key_id,
                        user_id=actor.user.id,
                        tool=tool_name,
                        arguments=bound,
                    )
                except ValueError as exc:
                    code = {
                        "missing": "confirmation_invalid",
                        "invalid": "confirmation_invalid",
                        "wrong_action": "confirmation_wrong_action",
                        "wrong_actor": "confirmation_invalid",
                        "args_changed": "confirmation_args_changed",
                    }.get(str(exc), "confirmation_invalid")
                    raise McpToolError("That confirmation cannot be used.", code=code) from exc
                token_ctx = mcp_confirmation_ok.set(True)
            if idem_key:
                cached = get_cached(actor.api_key_id, tool_name, str(idem_key))
                if cached:
                    return cached
            out = fn(db, actor, **kwargs)
            if isinstance(out, str):
                rendered = out
            else:
                if isinstance(out, dict) and "ok" not in out:
                    out = {"ok": True, **out}
                rendered = json_ok(
                    out if isinstance(out, dict) else {"ok": True, "result": out},
                    friendly_name=policy.friendly_name if policy else None,
                )
            if idem_key:
                try:
                    parsed = json.loads(rendered)
                    if parsed.get("ok") or parsed.get("success"):
                        store_idempotent(actor.api_key_id, tool_name, str(idem_key), rendered)
                except Exception:
                    pass
            return rendered
        except McpToolError as exc:
            return json_err(exc.message, code=exc.code, **(exc.extra or {}))
        except Exception as exc:
            logger.exception("MCP tool %s failed", tool_name or getattr(fn, "__name__", "tool"))
            return json_err(str(exc))
        finally:
            if token_ctx is not None:
                mcp_confirmation_ok.reset(token_ctx)
            db.close()

    return _exec


# ----- Projects -----


def list_projects(limit: int = 50) -> str:
    """List projects accessible to the API key owner."""

    def _inner(db: Session, actor: McpActor, limit: int = 50):
        from app.models import Project

        lim = parse_limit(limit, default=50, max_limit=100)
        ids = list(actor.accessible_project_ids or [])
        if not ids and actor.auth_project_id:
            ids = [actor.auth_project_id]
        rows = (
            db.query(Project)
            .filter(Project.id.in_(ids))
            .order_by(desc(Project.updated_at))
            .limit(lim)
            .all()
        )
        return {
            "projects": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "is_active": bool(p.is_active),
                    "org_id": p.org_id,
                }
                for p in rows
            ]
        }

    return _wrap(_inner)(limit=limit)


def get_project(project_id: Optional[str] = None) -> str:
    """Get one project by id (default: API key project)."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from app.models import Project

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        p = db.query(Project).filter(Project.id == pid).first()
        if not p:
            raise McpToolError("Project not found", code="not_found")
        return {
            "id": str(p.id),
            "name": p.name,
            "description": p.description,
            "is_active": bool(p.is_active),
            "owner_id": p.owner_id,
            "org_id": p.org_id,
        }

    return _wrap(_inner)(project_id=project_id)


def create_project(
    project_name: str = "",
    description: Optional[str] = None,
    confirm: bool = False,
    idempotency_key: Optional[str] = None,
) -> str:
    """Create a project in the key owner's org. Ask for an optional description and allow it to be skipped. Use project_name (not name). Returns project_id only. Requires confirm=true."""

    def _inner(
        db: Session,
        actor: McpActor,
        project_name: str = "",
        description: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.auth import is_org_admin_user
        from app.models import Organization, Project, ProjectMember
        from app.services.notification_service import create_notification

        require_confirm(confirm)
        if not can_create_project(db, actor):
            raise McpToolError("Not allowed to create projects", code="forbidden")
        user = actor.user
        if not user.org_id:
            raise McpToolError("Organization is required before creating a project", code="no_org")
        resolved_name = (project_name or "").strip()
        if not resolved_name:
            raise McpToolError(
                "project_name is required (do not pass 'name' — it conflicts with the MCP tool envelope)",
                code="bad_request",
            )
        existing = (
            db.query(Project)
            .filter(Project.org_id == user.org_id, Project.name == resolved_name)
            .first()
        )
        if existing:
            raise McpToolError(f"Project with name '{resolved_name}' already exists", code="conflict")
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        existing_count = db.query(Project).filter(Project.org_id == user.org_id).count()
        if org and org.max_projects > 0 and existing_count >= org.max_projects:
            raise McpToolError("Organization project limit exceeded", code="limit")
        is_active = existing_count == 0
        if is_active:
            db.query(Project).filter(Project.org_id == user.org_id).update({"is_active": False})
        project = Project(
            name=resolved_name,
            description=description,
            owner_id=user.id,
            org_id=user.org_id,
            is_active=is_active,
        )
        db.add(project)
        db.flush()
        if is_org_admin_user(db, user):
            db.add(
                ProjectMember(
                    project_id=project.id,
                    user_id=user.id,
                    permissions=[
                        "project:read",
                        "project:write",
                        "project:create",
                        "crawl:manage",
                        "documents:manage",
                        "connectors:manage",
                        "chat:use",
                        "search:use",
                        "chatbot:settings",
                        "search:settings",
                        "analytics:read",
                        "history:read",
                        "api_keys:manage",
                        "widgets:manage",
                        "settings:manage",
                    ],
                    granted_by=user.id,
                )
            )
        db.commit()
        db.refresh(project)
        try:
            create_notification(
                db=db,
                user_id=user.id,
                title="Project Created",
                message=f"Project '{project.name}' created via MCP",
                type="success",
                action_url="/projects",
            )
        except Exception:
            pass
        audit_mcp(
            db,
            actor=actor,
            event_type="project.created",
            project_id=project.id,
            action="create_project",
            resource_type="project",
            resource_id=str(project.id),
            summary=f"MCP created project {project.name}",
        )
        return {
            "ok": True,
            "project_id": str(project.id),
            "project_name": project.name,
            "note": (
                "Create a project-scoped API key for this project in Configuration → API Keys "
                "to use knowledge MCP tools against it."
            ),
        }

    return _wrap(_inner)(
        project_name=project_name,
        description=description,
        confirm=confirm,
        idempotency_key=idempotency_key,
    )


def update_project(
    project_name: Optional[str] = None,
    description: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Update project project_name/description (no delete). Prefer project_name over name (MCP envelope)."""

    def _inner(
        db: Session,
        actor: McpActor,
        project_name: Optional[str] = None,
        description: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import Project

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:write")
        p = db.query(Project).filter(Project.id == pid).first()
        if not p:
            raise McpToolError("Project not found", code="not_found")
        if project_name is not None and str(project_name).strip():
            p.name = str(project_name).strip()
        if description is not None:
            p.description = description
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="project.updated",
            project_id=pid,
            action="update_project",
            resource_type="project",
            resource_id=str(pid),
        )
        return {
            "ok": True,
            "project_id": str(pid),
            "project_name": p.name,
            "description": p.description,
        }

    return _wrap(_inner)(
        project_name=project_name,
        description=description,
        project_id=project_id,
        confirm=confirm,
    )


def set_active_project(project_id: str, confirm: bool = False) -> str:
    """Switch the user's active project in RAGSuite, and use it for later tool calls. Requires confirm=true."""

    def _inner(
        db: Session,
        actor: McpActor,
        project_id: str,
        confirm: bool = False,
    ):
        from fastapi import HTTPException

        from app.models import APIKey, Project
        from app.platform.auth import set_user_active_project
        from app.services.notification_service import create_notification

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        key = db.query(APIKey).filter(APIKey.id == actor.api_key_id).first()
        if not key or getattr(key, "key_scope", None) != "mcp_user":
            raise McpToolError("set_active_project requires a personal MCP key", code="forbidden")
        project = db.query(Project).filter(Project.id == pid).first()
        if not project:
            raise McpToolError("Project not found", code="not_found")
        key.mcp_active_project_id = pid
        db.add(key)
        try:
            project = set_user_active_project(db, actor.user, project)
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "Could not activate project"
            raise McpToolError(detail, code="forbidden") from exc
        try:
            create_notification(
                db=db,
                user_id=actor.user.id,
                title="Project Activated",
                message=f"Project '{project.name}' has been activated and is now your active project.",
                type="info",
                action_url="/projects",
            )
        except Exception:
            logger.warning("Failed to create project activation notification", exc_info=True)
        audit_mcp(
            db,
            actor=actor,
            event_type="mcp.active_project",
            project_id=pid,
            action="set_active_project",
            resource_type="project",
            resource_id=str(pid),
            summary=f"MCP activated project {project.name}",
        )
        return {
            "ok": True,
            "project_id": str(project.id),
            "project_name": project.name,
            "is_active": bool(project.is_active),
        }

    return _wrap(_inner)(project_id=project_id, confirm=confirm)


# ----- History / metrics / jobs -----


def top_chat_queries(limit: int = 5, project_id: Optional[str] = None) -> str:
    """Top chat user messages by frequency for the project."""

    def _inner(db: Session, actor: McpActor, limit: int = 5, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_top_chat_queries

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "history:read")
        return tool_top_chat_queries(db, pid, {"limit": parse_limit(limit, default=5)})

    return _wrap(_inner)(limit=limit, project_id=project_id)


def top_search_queries(limit: int = 5, project_id: Optional[str] = None) -> str:
    """Top search queries by frequency for the project."""

    def _inner(db: Session, actor: McpActor, limit: int = 5, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_top_search_queries

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "history:read")
        return tool_top_search_queries(db, pid, {"limit": parse_limit(limit, default=5)})

    return _wrap(_inner)(limit=limit, project_id=project_id)


def recent_queries(limit: int = 10, mode: Optional[str] = None, project_id: Optional[str] = None) -> str:
    """Last N QueryLog rows (chronological). Optional mode: SEARCH or CHAT."""

    def _inner(
        db: Session,
        actor: McpActor,
        limit: int = 10,
        mode: Optional[str] = None,
        project_id: Optional[str] = None,
    ):
        from app.models import QueryLog, QueryMode

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "history:read")
        lim = parse_limit(limit, default=10)
        q = db.query(QueryLog).filter(QueryLog.project_id == pid)
        if mode:
            m = str(mode).strip().upper()
            if m in ("SEARCH", "CHAT", "AUTO"):
                q = q.filter(QueryLog.mode == QueryMode[m])
        rows = q.order_by(desc(QueryLog.timestamp)).limit(lim).all()
        return {
            "queries": [
                {
                    "query": (r.query or "")[:500],
                    "mode": getattr(r.mode, "value", str(r.mode)),
                    "result_count": r.result_count,
                    "latency_ms": r.p95_latency,
                    "llm_provider": r.llm_provider,
                    "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                }
                for r in rows
            ]
        }

    return _wrap(_inner)(limit=limit, mode=mode, project_id=project_id)


def recent_chat_history(limit: int = 10, project_id: Optional[str] = None) -> str:
    """Last N chat turns (user_message + assistant_response)."""

    def _inner(db: Session, actor: McpActor, limit: int = 10, project_id: Optional[str] = None):
        from app.models import ChatMessage

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "history:read")
        lim = parse_limit(limit, default=10)
        rows = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.project_id == pid,
                ChatMessage.message_type == "chat",
                ChatMessage.hidden_from_widget.is_(False),
            )
            .order_by(desc(ChatMessage.created_at))
            .limit(lim)
            .all()
        )
        return {
            "messages": [
                {
                    "user_message": (r.user_message or "")[:1000],
                    "assistant_response": (r.assistant_response or "")[:2000],
                    "feedback": r.feedback,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "session_id": r.session_id,
                }
                for r in rows
            ]
        }

    return _wrap(_inner)(limit=limit, project_id=project_id)


def overview_metrics(days: int = 7, project_id: Optional[str] = None) -> str:
    """High-level usage metrics for the project."""

    def _inner(db: Session, actor: McpActor, days: int = 7, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_overview_metrics

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "analytics:read")
        return tool_overview_metrics(db, pid, {"limit": parse_limit(days, default=7, max_limit=90)})

    return _wrap(_inner)(days=days, project_id=project_id)


def list_recent_jobs(limit: int = 10, project_id: Optional[str] = None) -> str:
    """Recent background jobs for the project."""

    def _inner(db: Session, actor: McpActor, limit: int = 10, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_list_recent_jobs

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        return tool_list_recent_jobs(db, pid, {"limit": parse_limit(limit, default=10)})

    return _wrap(_inner)(limit=limit, project_id=project_id)


def get_job_status(job_id: str, project_id: Optional[str] = None) -> str:
    """Get one background job by id."""

    def _inner(db: Session, actor: McpActor, job_id: str, project_id: Optional[str] = None):
        from app.models import BackgroundJob

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        jid = uuid.UUID(str(job_id))
        job = (
            db.query(BackgroundJob)
            .filter(BackgroundJob.id == jid, BackgroundJob.project_id == pid)
            .first()
        )
        if not job:
            raise McpToolError("Job not found", code="not_found")
        return {
            "id": str(job.id),
            "job_type": job.job_type,
            "status": getattr(job.status, "value", str(job.status)),
            "error": (job.error or "")[:500] or None,
            "queued_at": job.queued_at.isoformat() if job.queued_at else None,
            "finished_at": job.finished_at.isoformat() if job.finished_at else None,
        }

    return _wrap(_inner)(job_id=job_id, project_id=project_id)


def list_notifications(limit: int = 20) -> str:
    """Recent in-app notifications for the API key owner."""

    def _inner(db: Session, actor: McpActor, limit: int = 20):
        from app.models import Notification

        lim = parse_limit(limit, default=20)
        rows = (
            db.query(Notification)
            .filter(Notification.user_id == actor.user.id)
            .order_by(desc(Notification.created_at))
            .limit(lim)
            .all()
        )
        return {
            "notifications": [
                {
                    "id": str(n.id),
                    "title": n.title,
                    "message": (n.message or "")[:500],
                    "type": n.type,
                    "read": bool(getattr(n, "is_read", getattr(n, "read", False))),
                    "created_at": n.created_at.isoformat() if n.created_at else None,
                }
                for n in rows
            ]
        }

    return _wrap(_inner)(limit=limit)


def system_health_snapshot(project_id: Optional[str] = None) -> str:
    """System / service health snapshot for operators."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_system_health_snapshot

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        return tool_system_health_snapshot(db, pid, {})

    return _wrap(_inner)(project_id=project_id)


# ----- Crawl -----


def list_crawl_sources(limit: int = 50, project_id: Optional[str] = None) -> str:
    """List crawl sources with ids for the project."""

    def _inner(db: Session, actor: McpActor, limit: int = 50, project_id: Optional[str] = None):
        from app.models import CrawlSource

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        lim = parse_limit(limit, default=50, max_limit=100)
        rows = (
            db.query(CrawlSource)
            .filter(CrawlSource.project_id == pid)
            .order_by(desc(CrawlSource.updated_at))
            .limit(lim)
            .all()
        )
        return {
            "sources": [
                {
                    "id": str(s.id),
                    "name": s.name,
                    "base_url": s.base_url,
                    "status": getattr(s.status, "value", str(s.status)) if s.status else None,
                    "documents_count": s.documents_count,
                    "depth": s.depth,
                    "last_crawl_at": s.last_crawl_at.isoformat() if s.last_crawl_at else None,
                }
                for s in rows
            ]
        }

    return _wrap(_inner)(limit=limit, project_id=project_id)


def get_crawl_source(source_id: str, project_id: Optional[str] = None) -> str:
    """Get crawl source detail."""

    def _inner(db: Session, actor: McpActor, source_id: str, project_id: Optional[str] = None):
        from app.models import CrawlSource

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        s = (
            db.query(CrawlSource)
            .filter(CrawlSource.id == uuid.UUID(str(source_id)), CrawlSource.project_id == pid)
            .first()
        )
        if not s:
            raise McpToolError("Crawl source not found", code="not_found")
        return {
            "id": str(s.id),
            "name": s.name,
            "base_url": s.base_url,
            "description": s.description,
            "depth": s.depth,
            "cadence": getattr(s.cadence, "value", s.cadence),
            "allowlist": s.allowlist or [],
            "denylist": s.denylist or [],
            "documents_count": s.documents_count,
            "status": getattr(s.status, "value", str(s.status)) if s.status else None,
            "last_crawl_at": s.last_crawl_at.isoformat() if s.last_crawl_at else None,
        }

    return _wrap(_inner)(source_id=source_id, project_id=project_id)


def _parse_url_list(raw: Optional[str], field_name: str) -> list[str]:
    import json as _json

    if raw is None:
        raise McpToolError(f"{field_name} is required. Use [] when there are none.", code="fields_required", extra={"missing": [field_name]})
    try:
        parsed = _json.loads(raw) if str(raw).strip() else []
    except Exception as exc:
        raise McpToolError(f"{field_name} must be a JSON array of URL patterns", code="bad_request") from exc
    if not isinstance(parsed, list) or any(not isinstance(item, str) for item in parsed):
        raise McpToolError(f"{field_name} must be a JSON array of strings", code="bad_request")
    return parsed


def _parse_start_flag(value: Any) -> Optional[bool]:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return value
    if value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "yes", "1"):
            return True
        if lowered in ("false", "no", "0"):
            return False
    raise McpToolError("start_after_create must be true or false", code="bad_request")


def create_crawl_source(
    source_name: str = "",
    base_url: str = "",
    depth: Optional[int] = None,
    cadence: Optional[str] = None,
    allowlist_json: Optional[str] = None,
    denylist_json: Optional[str] = None,
    start_after_create: Optional[bool] = None,
    description: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Create a crawl source only after name, URL, project, depth, cadence, and lists are set. Does not start the crawl."""

    def _inner(
        db: Session,
        actor: McpActor,
        source_name: str = "",
        base_url: str = "",
        depth: Optional[int] = None,
        cadence: Optional[str] = None,
        allowlist_json: Optional[str] = None,
        denylist_json: Optional[str] = None,
        start_after_create: Optional[bool] = None,
        description: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import CrawlHeadlessMode, CrawlCadence, CrawlSource
        from app.security_utils import block_ssrf
        from app.services.crawl_source_embedding import crawl_create_ingest_targets
        from app.services.crawler import DEFAULT_CRAWL_SETTINGS, get_crawl_content_length_limit

        missing: list[str] = []
        resolved_name = (source_name or "").strip()
        url = (base_url or "").strip()
        if not resolved_name:
            missing.append("source_name")
        if not url:
            missing.append("base_url")
        if depth is None or depth == "":
            missing.append("depth")
        if not (cadence or "").strip():
            missing.append("cadence")
        if allowlist_json is None:
            missing.append("allowlist_json")
        if denylist_json is None:
            missing.append("denylist_json")
        if start_after_create is None or start_after_create == "":
            missing.append("start_after_create")
        if not (project_id or "").strip() and actor.auth_project_id is None:
            missing.append("project_id")
        if missing:
            raise McpToolError(
                "Ask for the missing crawl details, repeat them back, then call again with confirm=true. Use [] when there are no pages to include or skip.",
                code="fields_required",
                extra={"missing": missing},
            )
        start_flag = _parse_start_flag(start_after_create)
        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        try:
            depth_value = int(depth)  # type: ignore[arg-type]
        except (TypeError, ValueError) as exc:
            raise McpToolError("depth must be a whole number from 0 to 10", code="bad_request") from exc
        if depth_value < 0 or depth_value > 10:
            raise McpToolError("depth must be a whole number from 0 to 10", code="bad_request")
        cadence_name = str(cadence).strip().upper()
        if cadence_name not in {item.value for item in CrawlCadence}:
            raise McpToolError("cadence must be once, daily, weekly, or monthly", code="bad_request")
        allowlist = _parse_url_list(allowlist_json, "allowlist_json")
        denylist = _parse_url_list(denylist_json, "denylist_json")
        block_ssrf(url)
        targets = crawl_create_ingest_targets(db, pid, None)
        created = []
        for target_surface in targets or ["search"]:
            source = CrawlSource(
                name=resolved_name,
                base_url=url,
                depth=depth_value,
                cadence=CrawlCadence(cadence_name),
                description=description,
                created_by_id=actor.user.id,
                project_id=pid,
                allowlist=allowlist,
                denylist=denylist,
                skip_header_footer=True,
                headless=CrawlHeadlessMode.AUTO,
                max_pages=DEFAULT_CRAWL_SETTINGS.get("max_pages"),
                max_runtime_minutes=DEFAULT_CRAWL_SETTINGS.get("max_runtime_minutes"),
                max_links_per_page=DEFAULT_CRAWL_SETTINGS.get("max_links_per_page"),
                content_length_limit=get_crawl_content_length_limit(),
                delay_seconds=DEFAULT_CRAWL_SETTINGS.get("delay_seconds"),
                ingest_embedding_target=target_surface,
            )
            db.add(source)
            db.flush()
            created.append(str(source.id))
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="crawl_source.created",
            project_id=pid,
            action="create_crawl_source",
            resource_type="crawl_source",
            resource_id=created[0] if created else None,
            summary=f"MCP created crawl source {resolved_name}",
        )
        note = "Source saved. It is not crawling yet."
        if start_flag:
            note = "Source saved. Call start_crawl with this source_id and confirm=true to begin."
        return {
            "ok": True,
            "source_ids": created,
            "source_name": resolved_name,
            "base_url": url,
            "depth": depth_value,
            "cadence": cadence_name,
            "start_after_create": start_flag,
            "note": note,
        }

    return _wrap(_inner)(
        source_name=source_name,
        base_url=base_url,
        depth=depth,
        cadence=cadence,
        allowlist_json=allowlist_json,
        denylist_json=denylist_json,
        start_after_create=start_after_create,
        description=description,
        project_id=project_id,
        confirm=confirm,
    )


def update_crawl_source(
    source_id: str,
    source_name: Optional[str] = None,
    depth: Optional[int] = None,
    description: Optional[str] = None,
    allowlist_json: Optional[str] = None,
    denylist_json: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Update crawl source settings (no delete). Prefer source_name over name (MCP envelope)."""

    def _inner(
        db: Session,
        actor: McpActor,
        source_id: str,
        source_name: Optional[str] = None,
        depth: Optional[int] = None,
        description: Optional[str] = None,
        allowlist_json: Optional[str] = None,
        denylist_json: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        import json as _json

        from app.models import CrawlSource

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        s = (
            db.query(CrawlSource)
            .filter(CrawlSource.id == uuid.UUID(str(source_id)), CrawlSource.project_id == pid)
            .first()
        )
        if not s:
            raise McpToolError("Crawl source not found", code="not_found")
        if source_name is not None and str(source_name).strip():
            s.name = str(source_name).strip()
        if depth is not None:
            s.depth = int(depth)
        if description is not None:
            s.description = description
        if allowlist_json is not None:
            s.allowlist = _json.loads(allowlist_json) if allowlist_json else []
        if denylist_json is not None:
            s.denylist = _json.loads(denylist_json) if denylist_json else []
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="crawl_source.updated",
            project_id=pid,
            action="update_crawl_source",
            resource_type="crawl_source",
            resource_id=str(s.id),
        )
        return {"ok": True, "source_id": str(s.id), "source_name": s.name}

    return _wrap(_inner)(
        source_id=source_id,
        source_name=source_name,
        depth=depth,
        description=description,
        allowlist_json=allowlist_json,
        denylist_json=denylist_json,
        project_id=project_id,
        confirm=confirm,
    )


def start_crawl(source_id: str, project_id: Optional[str] = None, confirm: bool = False) -> str:
    """Start a crawl job for a named source. Ask which source, repeat it, then call with confirm=true."""

    def _inner(
        db: Session,
        actor: McpActor,
        source_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import CrawlSource
        from app.services.crawl_orchestration import CrawlStartTrigger, start_crawl_for_source

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        sid = uuid.UUID(str(source_id))
        source = (
            db.query(CrawlSource)
            .filter(CrawlSource.id == sid, CrawlSource.project_id == pid)
            .first()
        )
        if not source:
            raise McpToolError("Crawl source not found", code="not_found")
        result = start_crawl_for_source(
            db,
            sid,
            user_id=actor.user.id,
            trigger=CrawlStartTrigger.MANUAL,
        )
        audit_mcp(
            db,
            actor=actor,
            event_type="crawl.started",
            project_id=pid,
            action="start_crawl",
            resource_type="crawl_source",
            resource_id=str(sid),
            summary=getattr(result, "message", None),
        )
        return {
            "ok": True,
            "job_id": str(getattr(result, "job_id", None)),
            "message": getattr(result, "message", None),
            "enqueue_status": getattr(result, "enqueue_status", None),
        }

    return _wrap(_inner)(source_id=source_id, project_id=project_id, confirm=confirm)


def reindex_source(source_id: str, project_id: Optional[str] = None, confirm: bool = False) -> str:
    """Reindex a named crawl source. Repeat the source, then call with confirm=true."""

    def _inner(
        db: Session,
        actor: McpActor,
        source_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import BackgroundJobType, CrawlSource
        from app.services.job_queue import enqueue_job

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        sid = uuid.UUID(str(source_id))
        source = (
            db.query(CrawlSource)
            .filter(CrawlSource.id == sid, CrawlSource.project_id == pid)
            .first()
        )
        if not source:
            raise McpToolError("Crawl source not found", code="not_found")
        run_id = str(uuid.uuid4())
        job = enqueue_job(
            db,
            job_type=BackgroundJobType.REINDEX.value,
            payload={
                "project_id": str(pid),
                "source": "search",
                "run_id": run_id,
                "phase": "crawl",
                "crawl_source_id": str(sid),
            },
            user_id=actor.user.id,
            project_id=pid,
            idempotency_key=f"reindex:{pid}:search:{run_id}:crawl{sid}",
            priority=1,
        )
        doc_count, embedded, err = None, None, None
        audit_mcp(
            db,
            actor=actor,
            event_type="crawl.reindex",
            project_id=pid,
            action="reindex_source",
            resource_type="crawl_source",
            resource_id=str(sid),
        )
        return {
            "ok": err is None,
            "documents": doc_count,
            "embedded": embedded,
            "error": err,
            "job_id": str(job.id),
            "status": job.status,
            "message": "Reindex queued. Use the job id to check progress.",
        }

    return _wrap(_inner)(source_id=source_id, project_id=project_id, confirm=confirm)


# ----- Documents -----


def list_documents(
    limit: int = 50,
    project_id: Optional[str] = None,
    title_contains: Optional[str] = None,
    uploaded_since: Optional[str] = None,
    source: Optional[str] = None,
    status: Optional[str] = None,
    cursor: Optional[int] = None,
) -> str:
    """List uploaded documents for the project."""

    def _inner(
        db: Session,
        actor: McpActor,
        limit: int = 50,
        project_id: Optional[str] = None,
        title_contains: Optional[str] = None,
        uploaded_since: Optional[str] = None,
        source: Optional[str] = None,
        status: Optional[str] = None,
        cursor: Optional[int] = None,
    ):
        from datetime import datetime

        from app.models import UploadedDocument

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        lim = parse_limit(limit, default=50, max_limit=100)
        query = db.query(UploadedDocument).filter(UploadedDocument.project_id == pid)
        if title_contains:
            query = query.filter(UploadedDocument.title.ilike(f"%{title_contains.strip()}%"))
        if source:
            query = query.filter(UploadedDocument.source.ilike(f"%{source.strip()}%"))
        if status:
            query = query.filter(UploadedDocument.status.ilike(status.strip()))
        if uploaded_since:
            try:
                since = datetime.fromisoformat(uploaded_since.replace("Z", "+00:00"))
            except ValueError as exc:
                raise McpToolError("uploaded_since must be an ISO date.", code="bad_request") from exc
            query = query.filter(UploadedDocument.indexed_at >= since)
        offset = max(int(cursor or 0), 0)
        rows = query.order_by(desc(UploadedDocument.indexed_at)).offset(offset).limit(lim).all()
        return {
            "documents": [
                {
                    "id": str(d.id),
                    "filename": getattr(d, "filename", None) or getattr(d, "original_filename", None),
                    "status": getattr(d, "status", None),
                    "language": getattr(d, "language", None),
                    "chunks_count": getattr(d, "chunks_count", None),
                    "title": getattr(d, "title", None),
                    "created_at": d.indexed_at.isoformat() if getattr(d, "indexed_at", None) else None,
                }
                for d in rows
            ],
            "next_cursor": offset + len(rows) if len(rows) == lim else None,
        }

    return _wrap(_inner)(
        limit=limit,
        project_id=project_id,
        title_contains=title_contains,
        uploaded_since=uploaded_since,
        source=source,
        status=status,
        cursor=cursor,
    )


def get_document(document_id: str, project_id: Optional[str] = None) -> str:
    """Get uploaded document metadata (no file bytes)."""

    def _inner(db: Session, actor: McpActor, document_id: str, project_id: Optional[str] = None):
        from app.models import UploadedDocument

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        d = (
            db.query(UploadedDocument)
            .filter(
                UploadedDocument.id == uuid.UUID(str(document_id)),
                UploadedDocument.project_id == pid,
            )
            .first()
        )
        if not d:
            raise McpToolError("Document not found", code="not_found")
        return {
            "id": str(d.id),
            "filename": getattr(d, "filename", None) or getattr(d, "original_filename", None),
            "status": getattr(d, "status", None),
            "language": getattr(d, "language", None),
            "chunks_count": getattr(d, "chunks_count", None),
            "checksum": getattr(d, "checksum", None),
        }

    return _wrap(_inner)(document_id=document_id, project_id=project_id)


def reindex_document(document_id: str, project_id: Optional[str] = None, confirm: bool = False) -> str:
    """Re-embed a named uploaded document. Repeat the document, then call with confirm=true."""

    def _inner(
        db: Session,
        actor: McpActor,
        document_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import BackgroundJobType, UploadedDocument
        from app.services.job_queue import enqueue_job

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "documents:manage")
        did = uuid.UUID(str(document_id))
        doc = (
            db.query(UploadedDocument)
            .filter(UploadedDocument.id == did, UploadedDocument.project_id == pid)
            .first()
        )
        if not doc:
            raise McpToolError("Document not found", code="not_found")
        run_id = str(uuid.uuid4())
        job = enqueue_job(
            db,
            job_type=BackgroundJobType.REINDEX.value,
            payload={
                "project_id": str(pid),
                "document_ids": [str(did)],
                "source": "search",
                "run_id": run_id,
                "phase": "upload",
            },
            user_id=actor.user.id,
            project_id=pid,
            idempotency_key=f"reindex:{pid}:search:{run_id}:upload0",
            priority=1,
        )
        result = {"job_id": str(job.id), "status": job.status}
        audit_mcp(
            db,
            actor=actor,
            event_type="document.reindex",
            project_id=pid,
            action="reindex_document",
            resource_type="document",
            resource_id=str(did),
        )
        return {"ok": True, "document_id": str(did), **(result if isinstance(result, dict) else {"result": result})}

    return _wrap(_inner)(document_id=document_id, project_id=project_id, confirm=confirm)


def update_document_metadata(
    document_id: str,
    language: Optional[str] = None,
    title: Optional[str] = None,
    description: Optional[str] = None,
    meta_json: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Update a document title or language. Ask which field changes, then call with confirm=true. No file upload."""

    def _inner(
        db: Session,
        actor: McpActor,
        document_id: str,
        language: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        meta_json: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import UploadedDocument

        require_confirm(confirm)
        if language is None and title is None and description is None and not meta_json:
            raise McpToolError(
                "Say which title, description, language, or metadata to change.",
                code="fields_required",
                extra={"missing": ["title", "language", "description", "meta_json"]},
            )
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "documents:manage")
        d = (
            db.query(UploadedDocument)
            .filter(
                UploadedDocument.id == uuid.UUID(str(document_id)),
                UploadedDocument.project_id == pid,
            )
            .first()
        )
        if not d:
            raise McpToolError("Document not found", code="not_found")
        if language is not None and hasattr(d, "language"):
            d.language = str(language).strip().lower()[:16] or None
        if title is not None:
            for attr in ("title", "original_filename", "filename"):
                if hasattr(d, attr) and attr == "title":
                    d.title = title
                    break
        changes = []
        if description is not None and hasattr(d, "description"):
            changes.append({"field": "description", "old_value": d.description, "new_value": description})
            d.description = description
        if meta_json:
            import json as _json

            try:
                incoming = _json.loads(meta_json)
            except Exception as exc:
                raise McpToolError("meta_json must be a JSON object.", code="bad_request") from exc
            if not isinstance(incoming, dict):
                raise McpToolError("meta_json must be a JSON object.", code="bad_request")
            current = dict(d.meta_data or {})
            for key, value in incoming.items():
                changes.append({"field": key, "old_value": current.get(key), "new_value": value})
                current[key] = value
            d.meta_data = current
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="document.updated",
            project_id=pid,
            action="update_document_metadata",
            resource_type="document",
            resource_id=str(d.id),
        )
        return {
            "ok": True,
            "document_id": str(d.id),
            "language": getattr(d, "language", None),
            "message": "Document details updated.",
            "resource": {"id": str(d.id), "name": getattr(d, "title", None), "type": "document"},
            "changes": changes,
        }

    return _wrap(_inner)(
        document_id=document_id,
        language=language,
        title=title,
        description=description,
        meta_json=meta_json,
        project_id=project_id,
        confirm=confirm,
    )


# ----- Config -----


def describe_chatbot_config(project_id: Optional[str] = None) -> str:
    """Describe chatbot settings (API keys masked)."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_describe_chatbot_config

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        return tool_describe_chatbot_config(db, pid, {})

    return _wrap(_inner)(project_id=project_id)


def describe_search_config(project_id: Optional[str] = None) -> str:
    """Describe search settings (API keys masked)."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from ragsuite_modules.ai_assistant.backend.tools import tool_describe_search_config

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        return tool_describe_search_config(db, pid, {})

    return _wrap(_inner)(project_id=project_id)


def _reject_unsafe_settings(fields: dict, allowed: set[str]) -> None:
    if not isinstance(fields, dict):
        raise McpToolError("fields_json must be an object", code="bad_request")
    rejected = [key for key in fields if key not in allowed or key == "api_key"]
    if rejected:
        raise McpToolError(
            "This change includes a field that cannot be set from MCP. Remove it and confirm the remaining fields.",
            code="fields_rejected",
            extra={"rejected": rejected},
        )


_CHATBOT_SAFE_FIELDS = {
    "chatbot_title",
    "short_description",
    "bubble_message",
    "welcome_message",
    "hero_title",
    "hero_subtitle",
    "chatbot_language",
    "is_active",
    "is_search_active",
    "feedback_enabled",
    "store_history_enabled",
    "chat_top_k",
    "chat_similarity_threshold",
    "chat_max_tokens",
    "chat_use_reranker",
    "chat_temperature",
    "chat_top_p",
    "model_provider",
    "chat_model",
    "faq_enabled",
}


def update_chatbot_settings(
    fields_json: str,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Update chatbot settings. Read current values, show old and new, then confirm=true. Rejects api_key and unknown fields."""

    def _inner(
        db: Session,
        actor: McpActor,
        fields_json: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        import json as _json

        from app.models import ChatbotSettings

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "chatbot:settings")
        try:
            fields = _json.loads(fields_json or "{}")
        except Exception as exc:
            raise McpToolError(f"Invalid fields_json: {exc}", code="bad_request") from exc
        _reject_unsafe_settings(fields, _CHATBOT_SAFE_FIELDS)
        row = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.project_id == pid)
            .order_by(desc(ChatbotSettings.updated_at))
            .first()
        )
        if not row:
            row = ChatbotSettings(project_id=pid, user_id=actor.user.id)
            db.add(row)
        from app.routes.chatbot import _effective_chatbot_title

        updated = []
        for key, val in fields.items():
            if key == "chatbot_title":
                val = _effective_chatbot_title(None if val is None else str(val))
            setattr(row, key, val)
            updated.append(key)
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="chatbot_settings.updated",
            project_id=pid,
            action="update_chatbot_settings",
            resource_type="chatbot_settings",
            resource_id=str(pid),
            details={"fields": updated},
        )
        return {"ok": True, "updated_fields": updated}

    return _wrap(_inner)(fields_json=fields_json, project_id=project_id, confirm=confirm)


_SEARCH_SAFE_FIELDS = {
    "search_prompt",
    "is_search_active",
    "feedback_enabled",
    "search_top_k",
    "search_similarity_threshold",
    "search_use_reranker",
    "model_provider",
    "search_model",
}


def update_search_settings(
    fields_json: str,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Update search settings. Read current values, show old and new, then confirm=true. Rejects api_key and unknown fields."""

    def _inner(
        db: Session,
        actor: McpActor,
        fields_json: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        import json as _json

        from app.models import SearchSettings

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "search:settings")
        try:
            fields = _json.loads(fields_json or "{}")
        except Exception as exc:
            raise McpToolError(f"Invalid fields_json: {exc}", code="bad_request") from exc
        _reject_unsafe_settings(fields, _SEARCH_SAFE_FIELDS)
        row = (
            db.query(SearchSettings)
            .filter(SearchSettings.project_id == pid)
            .order_by(desc(SearchSettings.updated_at))
            .first()
        )
        if not row:
            row = SearchSettings(project_id=pid, user_id=actor.user.id)
            db.add(row)
        updated = []
        for key, val in fields.items():
            setattr(row, key, val)
            updated.append(key)
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="search_settings.updated",
            project_id=pid,
            action="update_search_settings",
            resource_type="search_settings",
            resource_id=str(pid),
            details={"fields": updated},
        )
        return {"ok": True, "updated_fields": updated}

    return _wrap(_inner)(fields_json=fields_json, project_id=project_id, confirm=confirm)


def get_embedding_coverage(project_id: Optional[str] = None) -> str:
    """Embedding coverage summary for the project."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from app.services.reindex_service import expected_coverage_item_ids

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        all_ids, uploaded_ids, crawl_ids, total_display = expected_coverage_item_ids(db, pid)
        return {
            "total_display": total_display,
            "uploaded_count": len(uploaded_ids),
            "crawl_source_count": len(crawl_ids),
            "expected_item_count": len(all_ids),
        }

    return _wrap(_inner)(project_id=project_id)


def describe_widget_config(project_id: Optional[str] = None) -> str:
    """Widget / chatbot chrome settings summary."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from app.models import ChatbotSettings

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        row = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.project_id == pid)
            .order_by(desc(ChatbotSettings.updated_at))
            .first()
        )
        if not row:
            return {"configured": False}
        return {
            "configured": True,
            "chatbot_title": row.chatbot_title,
            "widget_layout": getattr(row, "widget_layout", None),
            "widget_chatbot_color": getattr(row, "widget_chatbot_color", None),
            "widget_show_logo": getattr(row, "widget_show_logo", None),
            "is_active": bool(row.is_active),
        }

    return _wrap(_inner)(project_id=project_id)


_WIDGET_SAFE_FIELDS = {
    "chatbot_title",
    "short_description",
    "bubble_message",
    "welcome_message",
    "widget_layout",
    "widget_chatbot_color",
    "widget_background_color",
    "widget_text_color",
    "widget_show_logo",
    "widget_show_date_time",
    "widget_show_backdrop",
}


def update_widget_settings(
    fields_json: str,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Update widget settings. Read current values, show old and new, then confirm=true. Rejects secrets and unknown fields."""

    def _inner(
        db: Session,
        actor: McpActor,
        fields_json: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        import json as _json

        from app.models import ChatbotSettings

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "widgets:manage")
        try:
            fields = _json.loads(fields_json or "{}")
        except Exception as exc:
            raise McpToolError(f"Invalid fields_json: {exc}", code="bad_request") from exc
        _reject_unsafe_settings(fields, _WIDGET_SAFE_FIELDS)
        row = (
            db.query(ChatbotSettings)
            .filter(ChatbotSettings.project_id == pid)
            .order_by(desc(ChatbotSettings.updated_at))
            .first()
        )
        if not row:
            row = ChatbotSettings(project_id=pid, user_id=actor.user.id)
            db.add(row)
        from app.routes.chatbot import _effective_chatbot_title

        updated = []
        for key, val in fields.items():
            if hasattr(row, key):
                if key == "chatbot_title":
                    val = _effective_chatbot_title(None if val is None else str(val))
                setattr(row, key, val)
                updated.append(key)
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="widget_settings.updated",
            project_id=pid,
            action="update_widget_settings",
            resource_type="widget_settings",
            resource_id=str(pid),
            details={"fields": updated},
        )
        return {"ok": True, "updated_fields": updated}

    return _wrap(_inner)(fields_json=fields_json, project_id=project_id, confirm=confirm)


# ----- Connectors -----


def list_connectors(project_id: Optional[str] = None) -> str:
    """List connector integrations for the project (no tokens)."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from app.models import ConnectorIntegration

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        rows = (
            db.query(ConnectorIntegration)
            .filter(ConnectorIntegration.project_id == pid)
            .order_by(desc(ConnectorIntegration.updated_at))
            .all()
        )
        return {
            "connectors": [
                {
                    "id": str(c.id),
                    "connector_type": c.connector_type,
                    "account_label": c.account_label,
                    "status": getattr(c.status, "value", str(c.status)),
                    "is_active": bool(c.is_active),
                    "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
                    "documents_indexed": c.documents_indexed,
                }
                for c in rows
            ]
        }

    return _wrap(_inner)(project_id=project_id)


def get_connector(connector_id: str, project_id: Optional[str] = None) -> str:
    """Get connector detail without secrets."""

    def _inner(db: Session, actor: McpActor, connector_id: str, project_id: Optional[str] = None):
        from app.models import ConnectorIntegration

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        c = (
            db.query(ConnectorIntegration)
            .filter(
                ConnectorIntegration.id == uuid.UUID(str(connector_id)),
                ConnectorIntegration.project_id == pid,
            )
            .first()
        )
        if not c:
            raise McpToolError("Connector not found", code="not_found")
        return {
            "id": str(c.id),
            "connector_type": c.connector_type,
            "account_label": c.account_label,
            "status": getattr(c.status, "value", str(c.status)),
            "is_active": bool(c.is_active),
            "last_sync_at": c.last_sync_at.isoformat() if c.last_sync_at else None,
            "documents_indexed": c.documents_indexed,
            "token_expiry": c.token_expiry.isoformat() if c.token_expiry else None,
        }

    return _wrap(_inner)(connector_id=connector_id, project_id=project_id)


def sync_connector(connector_id: str, project_id: Optional[str] = None, confirm: bool = False) -> str:
    """Sync one already-connected connector. Name it, wait for yes, then confirm=true. No OAuth connect."""

    def _inner(
        db: Session,
        actor: McpActor,
        connector_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import ConnectorIntegration, ConnectorIntegrationStatus, ConnectorSyncJob, ConnectorSyncJobStatus
        from app.services.connectors.framework import enqueue_connector_sync

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "connectors:manage")
        c = (
            db.query(ConnectorIntegration)
            .filter(
                ConnectorIntegration.id == uuid.UUID(str(connector_id)),
                ConnectorIntegration.project_id == pid,
            )
            .first()
        )
        if not c:
            raise McpToolError("Connector not found", code="not_found")
        if not c.is_active:
            raise McpToolError("Connector is not active; connect it in the UI first", code="not_connected")
        if c.status == ConnectorIntegrationStatus.DISCONNECTED:
            raise McpToolError("Connector is disconnected; reconnect in the UI (OAuth)", code="not_connected")
        status_val = getattr(c.status, "value", str(c.status))
        if status_val and "disconnect" in status_val.lower():
            raise McpToolError("Connector is disconnected; reconnect in the UI (OAuth)", code="not_connected")
        sync_job = ConnectorSyncJob(
            integration_id=c.id,
            status=ConnectorSyncJobStatus.PENDING,
        )
        db.add(sync_job)
        db.flush()
        ok = enqueue_connector_sync(db, integration=c, sync_job_id=sync_job.id)
        if not ok:
            # Fall back: mark job for workers that poll DB
            db.commit()
        else:
            db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="connector.sync",
            project_id=pid,
            action="sync_connector",
            resource_type="connector",
            resource_id=str(c.id),
        )
        return {
            "ok": True,
            "connector_id": str(c.id),
            "sync_job_id": str(sync_job.id),
            "enqueued": bool(ok),
        }

    return _wrap(_inner)(connector_id=connector_id, project_id=project_id, confirm=confirm)


# ----- Feedback / audit -----


def list_feedback(limit: int = 20, project_id: Optional[str] = None) -> str:
    """Recent chat feedback rows for the project."""

    def _inner(db: Session, actor: McpActor, limit: int = 20, project_id: Optional[str] = None):
        from app.models import ChatMessage

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        lim = parse_limit(limit, default=20)
        rows = (
            db.query(ChatMessage)
            .filter(
                ChatMessage.project_id == pid,
                ChatMessage.feedback.isnot(None),
            )
            .order_by(desc(ChatMessage.created_at))
            .limit(lim)
            .all()
        )
        return {
            "feedback": [
                {
                    "user_message": (r.user_message or "")[:300],
                    "feedback": r.feedback,
                    "feedback_rating": r.feedback_rating,
                    "feedback_text": (r.feedback_text or "")[:500] or None,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
        }

    return _wrap(_inner)(limit=limit, project_id=project_id)


def list_audit_events(
    limit: int = 20,
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    severity: Optional[str] = None,
    event_type: Optional[str] = None,
) -> str:
    """Recent audit events for the project (CE basic)."""

    def _inner(
        db: Session,
        actor: McpActor,
        limit: int = 20,
        project_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        category: Optional[str] = None,
        severity: Optional[str] = None,
        event_type: Optional[str] = None,
    ):
        from datetime import datetime

        from app.models import AuditEvent

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        lim = parse_limit(limit, default=20)
        query = db.query(AuditEvent).filter(AuditEvent.project_id == pid)
        if event_type:
            query = query.filter(AuditEvent.event_type == event_type)
        if category:
            query = query.filter(AuditEvent.category == category)
        if severity:
            query = query.filter(AuditEvent.severity == severity)

        def _parse(raw: Optional[str]):
            if not raw:
                return None
            try:
                return datetime.fromisoformat(raw.replace("Z", "+00:00"))
            except ValueError as exc:
                raise McpToolError("Dates must be ISO-8601.", code="bad_request") from exc

        start = _parse(start_date)
        end = _parse(end_date)
        if start:
            query = query.filter(AuditEvent.timestamp >= start)
        if end:
            query = query.filter(AuditEvent.timestamp <= end)
        rows = query.order_by(desc(AuditEvent.timestamp)).limit(lim).all()
        return {
            "events": [
                {
                    "event_type": getattr(e, "event_type", None),
                    "action": getattr(e, "action", None),
                    "summary": getattr(e, "summary", None),
                    "resource_type": getattr(e, "resource_type", None),
                    "resource_id": getattr(e, "resource_id", None),
                    "created_at": e.timestamp.isoformat() if getattr(e, "timestamp", None) else None,
                }
                for e in rows
            ]
        }

    return _wrap(_inner)(
        limit=limit,
        project_id=project_id,
        start_date=start_date,
        end_date=end_date,
        category=category,
        severity=severity,
        event_type=event_type,
    )


# ----- EE optional (registered only when EE modules are loaded) -----


def analytics_overview(days: int = 7, project_id: Optional[str] = None) -> str:
    """EE analytics overview when analytics module is loaded."""

    def _inner(db: Session, actor: McpActor, days: int = 7, project_id: Optional[str] = None):
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "analytics:read")
        from app.platform.ee_feature_gate import enterprise_feature_denial

        locked = enterprise_feature_denial("analytics")
        if locked:
            return locked
        # Prefer EE analytics dashboard helpers when importable; else refuse figures.
        try:
            from ragsuite_modules.analytics.backend import dashboard as ee_dash  # noqa: F401

            from ragsuite_modules.ai_assistant.backend.tools import tool_overview_metrics

            data = tool_overview_metrics(db, pid, {"limit": parse_limit(days, default=7, max_limit=90)})
            if data.get("enterprise_locked"):
                return data
            data["edition"] = "ee"
            return data
        except ImportError:
            from app.platform.ee_feature_gate import enterprise_lock_message

            return {
                "enterprise_locked": True,
                "feature": "analytics",
                "message": enterprise_lock_message("analytics"),
            }

    return _wrap(_inner)(days=days, project_id=project_id)


def compare_models_status(project_id: Optional[str] = None) -> str:
    """Report whether Compare Models EE module is available (no compare run)."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        from app.platform.ee_feature_gate import enterprise_feature_denial

        locked = enterprise_feature_denial("compare_models")
        if locked:
            return locked
        return {
            "compare_models_available": True,
            "note": "Full compare runs are not started via MCP in this version.",
        }

    return _wrap(_inner)(project_id=project_id)


def _module_loaded(module_id: str) -> bool:
    try:
        from app.platform.module_loader import loaded_module_ids

        if module_id in loaded_module_ids():
            return True
    except Exception:
        pass
    try:
        import importlib.util

        return importlib.util.find_spec(f"ragsuite_modules.{module_id}") is not None
    except Exception:
        return False


def optional_ee_tools() -> list[tuple[Any, str, str]]:
    """EE read tools — only when corresponding EE modules are present."""
    tools: list[tuple[Any, str, str]] = []
    if _module_loaded("analytics"):
        tools.append(
            (
                analytics_overview,
                "analytics_overview",
                "Analytics overview (EE analytics module).",
            )
        )
    if _module_loaded("compare_models"):
        tools.append(
            (
                compare_models_status,
                "compare_models_status",
                "Whether Compare Models EE is available (no compare run).",
            )
        )
    return tools


def delete_project(project_id: str, confirm: bool = False, confirmation_token: Optional[str] = None) -> str:
    """Delete one project after the user confirms. The active project cannot be deleted."""

    def _inner(db: Session, actor: McpActor, project_id: str, confirm: bool = False):
        from app.models import Project
        from app.services.destructive_actions import delete_project_record

        require_confirm(confirm)
        try:
            pid = uuid.UUID(str(project_id).strip())
        except (ValueError, TypeError) as exc:
            raise McpToolError("Invalid project_id", code="bad_project") from exc
        require_permission(db, actor, pid, "project:admin")
        project = db.query(Project).filter(Project.id == pid).first()
        if not project:
            raise McpToolError("Project not found", code="not_found")
        if project.is_active:
            raise McpToolError(
                "Cannot delete the active project. Switch to another project first.",
                code="active_project",
            )
        name = project.name
        delete_project_record(db, project, user_id=actor.user.id)
        audit_mcp(
            db,
            actor=actor,
            event_type="project.deleted",
            project_id=None,
            action="delete_project",
            resource_type="project",
            resource_id=str(pid),
            summary=f"MCP deleted project {name}",
        )
        return {"ok": True, "project_id": str(pid), "project_name": name}

    return _wrap(_inner)(project_id=project_id, confirm=confirm, confirmation_token=confirmation_token)


def delete_crawl_source(
    source_id: str,
    project_id: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Delete one crawl source after the user confirms."""

    def _inner(
        db: Session,
        actor: McpActor,
        source_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import CrawlSource
        from app.services.destructive_actions import delete_crawl_source_record

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        source = (
            db.query(CrawlSource)
            .filter(CrawlSource.id == uuid.UUID(str(source_id)), CrawlSource.project_id == pid)
            .first()
        )
        if not source:
            raise McpToolError("Crawl source not found", code="not_found")
        name = source.name
        sid = delete_crawl_source_record(db, source, user_id=actor.user.id)
        audit_mcp(
            db,
            actor=actor,
            event_type="crawl.source.deleted",
            project_id=pid,
            action="delete_crawl_source",
            resource_type="crawl_source",
            resource_id=str(sid),
            summary=f"MCP deleted crawl source {name}",
        )
        return {"ok": True, "source_id": str(sid), "source_name": name}

    return _wrap(_inner)(source_id=source_id, project_id=project_id, confirm=confirm, confirmation_token=confirmation_token)


def delete_document(
    document_id: str,
    project_id: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Delete one uploaded document owned by the key user after they confirm."""

    def _inner(
        db: Session,
        actor: McpActor,
        document_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import UploadedDocument
        from app.services.destructive_actions import delete_uploaded_document

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "documents:manage")
        doc = (
            db.query(UploadedDocument)
            .filter(
                UploadedDocument.id == uuid.UUID(str(document_id)),
                UploadedDocument.project_id == pid,
                UploadedDocument.user_id == actor.user.id,
            )
            .first()
        )
        if not doc:
            raise McpToolError("Document not found", code="not_found")
        title = doc.title
        doc_id = delete_uploaded_document(db, doc, user_id=actor.user.id)
        audit_mcp(
            db,
            actor=actor,
            event_type="document.deleted",
            project_id=pid,
            action="delete_document",
            resource_type="document",
            resource_id=str(doc_id),
            summary=f"MCP deleted document {title}",
        )
        return {"ok": True, "document_id": str(doc_id), "resource": {"id": str(doc_id), "name": title, "type": "document"}}

    return _wrap(_inner)(
        document_id=document_id,
        project_id=project_id,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


# Registry for server.py (CE). Call get_platform_tools() for CE + optional EE.
PLATFORM_TOOLS: list[tuple[Any, str, str]] = [
    (list_projects, "list_projects", "List projects accessible to the API key owner."),
    (get_project, "get_project", "Get project details."),
    (create_project, "create_project", "Create a project (confirm=true). Ask for project_name and an optional description. Arg: project_name (not name)."),
    (update_project, "update_project", "Update project_name/description (confirm=true). Ask which project and what changes."),
    (set_active_project, "set_active_project", "Switch the workspace active project in RAGSuite (same as Activate) and use it for later tool calls (confirm=true)."),
    (top_chat_queries, "top_chat_queries", "Top chat queries by frequency."),
    (top_search_queries, "top_search_queries", "Top search queries by frequency."),
    (recent_queries, "recent_queries", "Last N QueryLog rows."),
    (recent_chat_history, "recent_chat_history", "Last N chat turns."),
    (overview_metrics, "overview_metrics", "Usage metrics overview."),
    (list_recent_jobs, "list_recent_jobs", "Recent background jobs."),
    (get_job_status, "get_job_status", "One background job by id."),
    (list_notifications, "list_notifications", "Recent notifications for the key owner."),
    (system_health_snapshot, "system_health_snapshot", "System health snapshot."),
    (list_crawl_sources, "list_crawl_sources", "List crawl sources with ids."),
    (get_crawl_source, "get_crawl_source", "Crawl source detail."),
    (create_crawl_source, "create_crawl_source", "Create a crawl source only after source_name, base_url, depth, cadence, allowlist_json, denylist_json, and start_after_create are set (confirm=true). Does not start the crawl."),
    (update_crawl_source, "update_crawl_source", "Update crawl source (confirm=true). Use source_name not name. Repeat the changes first."),
    (start_crawl, "start_crawl", "Start crawl for a named source (confirm=true). Separate from create."),
    (reindex_source, "reindex_source", "Reindex a named crawl source (confirm=true)."),
    (delete_crawl_source, "delete_crawl_source", "Delete one crawl source (confirm=true). Ask the user first."),
    (list_documents, "list_documents", "List uploaded documents."),
    (get_document, "get_document", "Uploaded document metadata."),
    (reindex_document, "reindex_document", "Reindex a named uploaded document (confirm=true)."),
    (update_document_metadata, "update_document_metadata", "Update document title or language (confirm=true). Requires one of those fields."),
    (delete_document, "delete_document", "Delete one uploaded document owned by the user (confirm=true)."),
    (describe_chatbot_config, "describe_chatbot_config", "Describe chatbot config (keys masked)."),
    (describe_search_config, "describe_search_config", "Describe search config (keys masked)."),
    (update_chatbot_settings, "update_chatbot_settings", "Update chatbot fields via fields_json (confirm=true). Show old and new values first. api_key and unknown fields are rejected."),
    (update_search_settings, "update_search_settings", "Update search fields via fields_json (confirm=true). Show old and new values first. api_key and unknown fields are rejected."),
    (get_embedding_coverage, "get_embedding_coverage", "Embedding coverage summary."),
    (describe_widget_config, "describe_widget_config", "Widget chrome settings summary."),
    (update_widget_settings, "update_widget_settings", "Update widget fields via fields_json (confirm=true). Show old and new values first. Secrets and unknown fields are rejected."),
    (list_connectors, "list_connectors", "List connectors (no tokens)."),
    (get_connector, "get_connector", "Connector detail without secrets."),
    (sync_connector, "sync_connector", "Sync one already-connected connector (confirm=true). Name it and wait for yes. No OAuth."),
    (delete_project, "delete_project", "Delete one project (confirm=true). Refuses the active project."),
    (list_feedback, "list_feedback", "Recent feedback rows."),
    (list_audit_events, "list_audit_events", "Recent audit events."),
]


def get_platform_tools() -> list[tuple[Any, str, str]]:
    from .tools_extra import EXTRA_TOOLS

    tools = list(PLATFORM_TOOLS) + list(EXTRA_TOOLS) + optional_ee_tools()
    if _module_loaded("organization"):
        from .tools_admin import ADMIN_TOOLS

        tools.extend(ADMIN_TOOLS)
    return tools
