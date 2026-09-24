"""Additional MCP tools: capabilities, lookup, jobs, bulk documents, connectors, feedback."""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import desc

from .access import McpActor, McpToolError, audit_mcp, parse_limit, require_confirm, require_permission, resolve_project_id
from .policy import capabilities_overview
from .resolve import resolve_named
from .tools_platform import PREVIEW_BUILDERS, _wrap
from sqlalchemy.orm import Session


def describe_capabilities(include_tool_names: bool = False) -> str:
    """Plain-language overview of what this connection can do."""

    def _inner(db: Session, actor: McpActor, include_tool_names: bool = False):
        data = capabilities_overview(include_tool_names=bool(include_tool_names))
        return {"ok": True, "message": data["intro"], **data}

    return _wrap(_inner)(include_tool_names=include_tool_names)


def find_resources(kind: str, query: str, project_id: Optional[str] = None) -> str:
    """Find one resource by name. Several matches means ask the user."""

    def _inner(db: Session, actor: McpActor, kind: str, query: str, project_id: Optional[str] = None):
        pid = None
        if project_id:
            pid = resolve_project_id(actor, project_id)
        return resolve_named(db, actor, kind, query, project_id=pid)

    return _wrap(_inner)(kind=kind, query=query, project_id=project_id)


def cancel_pending_action(confirmation_token: str) -> str:
    """Drop a confirmation token so the pending action does not run."""

    def _inner(db: Session, actor: McpActor, confirmation_token: str):
        from .confirmations import cancel_token

        ok = cancel_token(confirmation_token, api_key_id=actor.api_key_id, user_id=actor.user.id)
        if not ok:
            raise McpToolError("There is no pending action with that confirmation.", code="not_found")
        return {"ok": True, "message": "Cancelled. Nothing was changed.", "cancelled": True}

    return _wrap(_inner)(confirmation_token=confirmation_token)


def _matching_documents(db: Session, project_id, title_contains: Optional[str], source: Optional[str], status: Optional[str]):
    from app.models import UploadedDocument

    query = db.query(UploadedDocument).filter(UploadedDocument.project_id == project_id)
    if title_contains:
        query = query.filter(UploadedDocument.title.ilike(f"%{title_contains.strip()}%"))
    if source:
        query = query.filter(UploadedDocument.source.ilike(f"%{source.strip()}%"))
    if status:
        query = query.filter(UploadedDocument.status.ilike(status.strip()))
    return query


def _bulk_preview(db: Session, actor: McpActor, arguments: dict) -> dict:
    pid = resolve_project_id(actor, arguments.get("project_id"))
    rows = _matching_documents(
        db, pid, arguments.get("title_contains"), arguments.get("source"), arguments.get("status")
    ).limit(8).all()
    total = _matching_documents(
        db, pid, arguments.get("title_contains"), arguments.get("source"), arguments.get("status")
    ).count()
    sample = [{"id": str(row.id), "name": row.title} for row in rows]
    return {
        "summary": f"This will affect {total} document(s). Nothing has changed yet.",
        "affected_count": total,
        "sample": sample,
    }


def bulk_update_documents(
    meta_json: str = "{}",
    title_contains: Optional[str] = None,
    source: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Update metadata on every matching uploaded document. Preview first."""

    def _inner(
        db: Session,
        actor: McpActor,
        meta_json: str = "{}",
        title_contains: Optional[str] = None,
        source: Optional[str] = None,
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "documents:manage")
        try:
            incoming = json.loads(meta_json or "{}")
        except Exception as exc:
            raise McpToolError("meta_json must be a JSON object.", code="bad_request") from exc
        if not isinstance(incoming, dict) or not incoming:
            raise McpToolError("Say which metadata fields to set.", code="fields_required")
        updated = 0
        query = _matching_documents(db, pid, title_contains, source, status)
        for row in query.yield_per(100):
            current = dict(row.meta_data or {})
            current.update(incoming)
            row.meta_data = current
            updated += 1
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="mcp.action",
            project_id=pid,
            action="bulk_update_documents",
            resource_type="document",
            summary=f"Updated metadata on {updated} documents",
            details={"fields": list(incoming), "confirmation": "confirmed"},
        )
        return {
            "ok": True,
            "message": f"Updated {updated} document(s).",
            "updated_count": updated,
            "changes": [{"field": key, "new_value": value} for key, value in incoming.items()],
        }

    return _wrap(_inner)(
        meta_json=meta_json,
        title_contains=title_contains,
        source=source,
        status=status,
        project_id=project_id,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def bulk_reindex_documents(
    title_contains: Optional[str] = None,
    source: Optional[str] = None,
    status: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Reindex every matching uploaded document as a background job. Preview first."""

    def _inner(
        db: Session,
        actor: McpActor,
        title_contains: Optional[str] = None,
        source: Optional[str] = None,
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.services.job_queue import enqueue_job

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "documents:manage")
        ids = [
            str(row.id)
            for row in _matching_documents(db, pid, title_contains, source, status).all()
        ]
        if not ids:
            return {"ok": True, "message": "No documents matched, so nothing was reindexed.", "updated_count": 0}
        run_id = str(uuid.uuid4())
        job = enqueue_job(
            db,
            job_type="REINDEX",
            project_id=pid,
            user_id=actor.user.id,
            payload={
                "project_id": str(pid),
                "document_ids": ids,
                "source": "search",
                "run_id": run_id,
                "phase": "upload",
            },
            idempotency_key=f"reindex:{pid}:search:{run_id}:bulk",
        )
        return {
            "ok": True,
            "message": f"Reindexing has started for {len(ids)} document(s).",
            "job_id": str(getattr(job, "id", "")),
            "updated_count": len(ids),
            "status": "queued",
        }

    return _wrap(_inner)(
        title_contains=title_contains,
        source=source,
        status=status,
        project_id=project_id,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def stop_crawl(source_id: str, project_id: Optional[str] = None, confirm: bool = False) -> str:
    """Stop the running crawl for a source without deleting pages."""

    def _inner(db: Session, actor: McpActor, source_id: str, project_id: Optional[str] = None, confirm: bool = False):
        from app.models import CrawlSource
        from app.routes.crawl import _cancel_active_crawl_work_for_source

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        sid = uuid.UUID(str(source_id))
        source = db.query(CrawlSource).filter(CrawlSource.id == sid, CrawlSource.project_id == pid).first()
        if not source:
            raise McpToolError("I couldn't find that crawl source.", code="not_found")
        crawl_count, ingest_count = _cancel_active_crawl_work_for_source(
            db, sid, reason="Cancelled: crawl stopped from MCP"
        )
        if not crawl_count and not ingest_count:
            raise McpToolError("There is no crawl running for that source.", code="not_found")
        return {
            "ok": True,
            "message": f"Stopped the crawl for {source.name}.",
            "resource": {"id": str(source.id), "name": source.name, "type": "crawl_source"},
        }

    return _wrap(_inner)(source_id=source_id, project_id=project_id, confirm=confirm)


def crawl_status(source_id: Optional[str] = None, project_id: Optional[str] = None, limit: int = 10) -> str:
    """Latest crawl jobs for a source or the project."""

    def _inner(
        db: Session,
        actor: McpActor,
        source_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 10,
    ):
        from app.models import BackgroundJob

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "crawl:manage")
        lim = parse_limit(limit, default=10, max_limit=50)
        query = db.query(BackgroundJob).filter(
            BackgroundJob.project_id == pid,
            BackgroundJob.job_type.in_(["CRAWL", "CRAWL_FETCH", "CRAWL_INGEST_BATCH"]),
        )
        rows = query.order_by(desc(BackgroundJob.queued_at)).limit(lim).all()
        if source_id:
            wanted = str(source_id)
            rows = [row for row in rows if str((row.payload or {}).get("source_id") or "") == wanted]
        return {
            "ok": True,
            "message": f"{len(rows)} recent crawl job(s).",
            "jobs": [
                {"id": str(row.id), "status": row.status, "job_type": row.job_type, "error": row.error}
                for row in rows
            ],
        }

    return _wrap(_inner)(source_id=source_id, project_id=project_id, limit=limit)


def list_jobs(
    status: Optional[str] = None,
    job_type: Optional[str] = None,
    since: Optional[str] = None,
    project_id: Optional[str] = None,
    limit: int = 20,
) -> str:
    """List background jobs, including failed jobs since a date."""

    def _inner(
        db: Session,
        actor: McpActor,
        status: Optional[str] = None,
        job_type: Optional[str] = None,
        since: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 20,
    ):
        from app.models import BackgroundJob

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        query = db.query(BackgroundJob).filter(BackgroundJob.project_id == pid)
        if status:
            query = query.filter(BackgroundJob.status.ilike(status.strip()))
        if job_type:
            query = query.filter(BackgroundJob.job_type.ilike(job_type.strip()))
        if since:
            try:
                start = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except ValueError as exc:
                raise McpToolError("since must be an ISO date.", code="bad_request") from exc
            query = query.filter(BackgroundJob.queued_at >= start)
        rows = query.order_by(desc(BackgroundJob.queued_at)).limit(parse_limit(limit, default=20, max_limit=100)).all()
        return {
            "ok": True,
            "message": f"{len(rows)} job(s).",
            "jobs": [
                {
                    "id": str(row.id),
                    "status": row.status,
                    "job_type": row.job_type,
                    "error": row.error,
                    "queued_at": row.queued_at.isoformat() if row.queued_at else None,
                }
                for row in rows
            ],
        }

    return _wrap(_inner)(status=status, job_type=job_type, since=since, project_id=project_id, limit=limit)


def retry_job(job_id: str, confirm: bool = False) -> str:
    """Retry one failed background job owned by this user."""

    def _inner(db: Session, actor: McpActor, job_id: str, confirm: bool = False):
        from fastapi import HTTPException

        from app.services.job_actions import retry_failed_job

        require_confirm(confirm)
        try:
            job = retry_failed_job(db, actor.user, uuid.UUID(str(job_id)))
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, str) else "That job cannot be retried."
            raise McpToolError(detail, code="bad_request") from exc
        return {
            "ok": True,
            "message": "The job is queued again.",
            "job_id": str(job.id),
            "status": job.status,
            "job": {"id": str(job.id), "status": job.status},
        }

    return _wrap(_inner)(job_id=job_id, confirm=confirm)


def get_job_progress_note(row) -> Optional[str]:
    result = row.result if isinstance(getattr(row, "result", None), dict) else {}
    return result.get("progress")


def disconnect_connector(
    connector_id: str,
    project_id: Optional[str] = None,
    confirm: bool = False,
    confirmation_token: Optional[str] = None,
) -> str:
    """Disconnect a connector. Preview first. Does not start OAuth."""

    def _inner(
        db: Session,
        actor: McpActor,
        connector_id: str,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import ConnectorIntegration, ConnectorIntegrationStatus

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "connectors:manage")
        row = (
            db.query(ConnectorIntegration)
            .filter(ConnectorIntegration.id == uuid.UUID(str(connector_id)), ConnectorIntegration.project_id == pid)
            .first()
        )
        if not row:
            raise McpToolError("I couldn't find that connector.", code="not_found")
        row.is_active = False
        row.status = ConnectorIntegrationStatus.DISCONNECTED
        row.access_token = ""
        row.refresh_token = ""
        db.commit()
        audit_mcp(
            db,
            actor=actor,
            event_type="mcp.action",
            project_id=pid,
            action="disconnect_connector",
            resource_type="connector",
            resource_id=str(row.id),
            summary=f"Disconnected {row.account_label or row.connector_type}",
            details={"confirmation": "confirmed"},
        )
        return {
            "ok": True,
            "message": f"Disconnected {row.account_label or row.connector_type}.",
            "resource": {"id": str(row.id), "name": row.account_label, "type": "connector"},
        }

    return _wrap(_inner)(
        connector_id=connector_id,
        project_id=project_id,
        confirm=confirm,
        confirmation_token=confirmation_token,
    )


def moderate_feedback(
    message_id: str,
    reviewed: Optional[bool] = None,
    flagged: Optional[bool] = None,
    internal_note: Optional[str] = None,
    project_id: Optional[str] = None,
    confirm: bool = False,
) -> str:
    """Mark feedback reviewed or flagged."""

    def _inner(
        db: Session,
        actor: McpActor,
        message_id: str,
        reviewed: Optional[bool] = None,
        flagged: Optional[bool] = None,
        internal_note: Optional[str] = None,
        project_id: Optional[str] = None,
        confirm: bool = False,
    ):
        from app.models import ChatMessage

        require_confirm(confirm)
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "feedback:moderate")
        row = (
            db.query(ChatMessage)
            .filter(ChatMessage.message_id == uuid.UUID(str(message_id)), ChatMessage.project_id == pid)
            .first()
        )
        if not row:
            raise McpToolError("I couldn't find that feedback.", code="not_found")
        mod = dict(row.feedback_moderation or {})
        if reviewed is not None:
            mod["reviewed"] = bool(reviewed)
        if flagged is not None:
            mod["flagged"] = bool(flagged)
        if internal_note is not None:
            mod["internal_notes"] = internal_note
        row.feedback_moderation = mod
        db.commit()
        return {"ok": True, "message": "Feedback review saved.", "message_id": str(row.message_id)}

    return _wrap(_inner)(
        message_id=message_id,
        reviewed=reviewed,
        flagged=flagged,
        internal_note=internal_note,
        project_id=project_id,
        confirm=confirm,
    )


def mark_notification_read(notification_id: str, confirm: bool = False) -> str:
    """Mark one notification read."""

    def _inner(db: Session, actor: McpActor, notification_id: str, confirm: bool = False):
        from app.services.destructive_actions import mark_notification_read as mark_one

        require_confirm(confirm)
        row = mark_one(db, actor.user.id, uuid.UUID(str(notification_id)))
        if not row:
            raise McpToolError("I couldn't find that notification.", code="not_found")
        return {"ok": True, "message": "Notification marked read."}

    return _wrap(_inner)(notification_id=notification_id, confirm=confirm)


def mark_all_notifications_read(confirm: bool = False) -> str:
    """Mark every notification for this person as read."""

    def _inner(db: Session, actor: McpActor, confirm: bool = False):
        from app.services.destructive_actions import mark_all_notifications_read as mark_all

        require_confirm(confirm)
        count = mark_all(db, actor.user.id)
        return {"ok": True, "message": f"Marked {count} notification(s) read.", "updated_count": count}

    return _wrap(_inner)(confirm=confirm)


def list_available_models(project_id: Optional[str] = None) -> str:
    """List chat and search models configured for the project."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from app.models import ModelConfigProfile

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        rows = db.query(ModelConfigProfile).filter(ModelConfigProfile.project_id == pid).all()
        return {
            "ok": True,
            "message": "These are the models configured for this project. Secrets are hidden.",
            "models": [
                {
                    "id": str(row.id),
                    "name": row.model_name,
                    "provider": row.provider,
                    "kind": row.profile_type,
                }
                for row in rows
            ],
        }

    return _wrap(_inner)(project_id=project_id)


def search_analytics(days: int = 7, project_id: Optional[str] = None) -> str:
    """Search analytics for a recent period."""

    def _inner(db: Session, actor: McpActor, days: int = 7, project_id: Optional[str] = None):
        from app.platform.ee_feature_gate import enterprise_feature_denial
        from ragsuite_modules.ai_assistant.backend.tools import tool_top_search_queries

        locked = enterprise_feature_denial("analytics")
        if locked:
            return locked
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        data = tool_top_search_queries(db, pid, {"limit": parse_limit(days, default=7, max_limit=90)})
        data["message"] = "Here are the recent searches."
        return data

    return _wrap(_inner)(days=days, project_id=project_id)


def chat_analytics(days: int = 7, project_id: Optional[str] = None) -> str:
    """Chat analytics for a recent period."""

    def _inner(db: Session, actor: McpActor, days: int = 7, project_id: Optional[str] = None):
        from app.platform.ee_feature_gate import enterprise_feature_denial
        from ragsuite_modules.ai_assistant.backend.tools import tool_top_chat_queries

        locked = enterprise_feature_denial("analytics")
        if locked:
            return locked
        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        data = tool_top_chat_queries(db, pid, {"limit": parse_limit(days, default=7, max_limit=90)})
        data["message"] = "Here are the recent chat questions."
        return data

    return _wrap(_inner)(days=days, project_id=project_id)


def list_integrations(project_id: Optional[str] = None) -> str:
    """List webhooks and n8n connections. Secrets are masked."""

    def _inner(db: Session, actor: McpActor, project_id: Optional[str] = None):
        from app.models import N8nIntegration, Webhook

        pid = resolve_project_id(actor, project_id)
        require_permission(db, actor, pid, "project:read")
        hooks = db.query(Webhook).filter(Webhook.project_id == pid).all()
        n8n = db.query(N8nIntegration).filter(N8nIntegration.project_id == pid).all()
        return {
            "ok": True,
            "message": "Integrations for this project. Secrets are hidden.",
            "webhooks": [{"id": str(row.id), "name": row.name, "url": row.url} for row in hooks],
            "n8n": [
                {"id": str(row.id), "base_url": row.base_url, "enabled": bool(row.is_enabled)}
                for row in n8n
            ],
        }

    return _wrap(_inner)(project_id=project_id)


PREVIEW_BUILDERS["bulk_update_documents"] = _bulk_preview
PREVIEW_BUILDERS["bulk_reindex_documents"] = _bulk_preview

EXTRA_TOOLS = [
    (describe_capabilities, "describe_capabilities", "Plain-language capabilities."),
    (find_resources, "find_resources", "Find a resource by name."),
    (cancel_pending_action, "cancel_pending_action", "Cancel a pending confirmation."),
    (bulk_update_documents, "bulk_update_documents", "Update matching documents."),
    (bulk_reindex_documents, "bulk_reindex_documents", "Reindex matching documents."),
    (stop_crawl, "stop_crawl", "Stop a running crawl."),
    (crawl_status, "crawl_status", "Latest crawl jobs."),
    (list_jobs, "list_jobs", "Find jobs by status and date."),
    (retry_job, "retry_job", "Retry a failed job."),
    (disconnect_connector, "disconnect_connector", "Disconnect a connector."),
    (moderate_feedback, "moderate_feedback", "Review feedback."),
    (mark_notification_read, "mark_notification_read", "Mark a notification read."),
    (mark_all_notifications_read, "mark_all_notifications_read", "Mark all notifications read."),
    (list_available_models, "list_available_models", "List models."),
    (search_analytics, "search_analytics", "Search analytics."),
    (chat_analytics, "chat_analytics", "Chat analytics."),
    (list_integrations, "list_integrations", "List integrations."),
]
