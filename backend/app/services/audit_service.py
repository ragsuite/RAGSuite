"""
Central audit event emitter — v1 catalog only (see EVENT_REGISTRY).
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, Request
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import AuditEvent

logger = logging.getLogger(__name__)

V1_EVENT_TYPES = frozenset(
    {
        "auth.login.success",
        "auth.login.failed",
        "auth.logout",
        "auth.register",
        "auth.password.changed",
        "auth.2fa.setup_started",
        "auth.2fa.enabled",
        "auth.2fa.disabled",
        "auth.2fa.email.enabled",
        "auth.2fa.email.disabled",
        "auth.2fa.backup_codes.regenerated",
        "auth.session.revoked",
        "auth.session.revoked_all",
        "auth.email_verification.sent",
        "auth.email_verification.verified",
        "auth.email_verification.failed",
        "auth.email_verification.resend_requested",
        "auth.2fa.login_code.sent",
        "auth.2fa.login_code.resend_requested",
        "api_key.created",
        "api_key.deleted",
        "project.created",
        "project.updated",
        "project.deleted",
        "integration.gmail.connected",
        "integration.gmail.disconnected",
        "integration.gmail.sync.failed",
        "integration.gmail.paused",
        "integration.gmail.resumed",
        "integration.embed.updated",
        "integration.domain.added",
        "integration.embed_key.deleted",
        "integration.embed_item.deleted",
        "webhook.created",
        "webhook.updated",
        "webhook.deleted",
        "webhook.secret.regenerated",
        "crawl.source.created",
        "crawl.source.updated",
        "crawl.source.deleted",
        "document.uploaded",
        "document.deleted",
        "embedding.reindex.requested",
        "config.chat_model.updated",
        "config.search_model.created",
        "config.search_model.deleted",
        "config.chatbot.updated",
        "data.chat_history.exported",
        "data.feedback_moderation.exported",
    }
)

# Account-wide events (project_id null) included in every project-scoped audit list.
ACCOUNT_SCOPED_EVENT_TYPES = frozenset(
    et for et in V1_EVENT_TYPES if et.startswith("auth.")
)


@dataclass(frozen=True)
class _EventMeta:
    category: str
    severity: str
    action: str


EVENT_REGISTRY: Dict[str, _EventMeta] = {
    "auth.login.success": _EventMeta("identity", "medium", "User signed in"),
    "auth.login.failed": _EventMeta("identity", "medium", "Sign-in failed"),
    "auth.logout": _EventMeta("identity", "low", "User signed out"),
    "auth.register": _EventMeta("identity", "medium", "Account registered"),
    "auth.password.changed": _EventMeta("identity", "high", "Password changed"),
    "auth.2fa.setup_started": _EventMeta("identity", "medium", "2FA setup started"),
    "auth.2fa.enabled": _EventMeta("identity", "high", "2FA enabled"),
    "auth.2fa.disabled": _EventMeta("identity", "high", "2FA disabled"),
    "auth.2fa.email.enabled": _EventMeta("identity", "high", "Email 2FA enabled"),
    "auth.2fa.email.disabled": _EventMeta("identity", "high", "Email 2FA disabled"),
    "auth.2fa.backup_codes.regenerated": _EventMeta(
        "identity", "high", "2FA backup codes regenerated"
    ),
    "auth.session.revoked": _EventMeta("identity", "medium", "Session revoked"),
    "auth.session.revoked_all": _EventMeta("identity", "high", "All other sessions revoked"),
    "auth.email_verification.sent": _EventMeta("identity", "low", "Verification email queued"),
    "auth.email_verification.verified": _EventMeta("identity", "medium", "Email address verified"),
    "auth.email_verification.failed": _EventMeta("identity", "medium", "Email verification failed"),
    "auth.email_verification.resend_requested": _EventMeta(
        "identity", "low", "Verification email resend requested"
    ),
    "auth.2fa.login_code.sent": _EventMeta("identity", "low", "Login 2FA code sent"),
    "auth.2fa.login_code.resend_requested": _EventMeta(
        "identity", "low", "Login 2FA code resend requested"
    ),
    "api_key.created": _EventMeta("identity", "high", "API key created"),
    "api_key.deleted": _EventMeta("identity", "high", "API key deleted"),
    "project.created": _EventMeta("config", "medium", "Project created"),
    "project.updated": _EventMeta("config", "low", "Project updated"),
    "project.deleted": _EventMeta("config", "critical", "Project deleted"),
    "integration.gmail.connected": _EventMeta("integration", "medium", "Gmail connected"),
    "integration.gmail.disconnected": _EventMeta("integration", "high", "Gmail disconnected"),
    "integration.gmail.sync.failed": _EventMeta("integration", "high", "Gmail sync failed"),
    "integration.gmail.paused": _EventMeta("integration", "low", "Gmail sync paused"),
    "integration.gmail.resumed": _EventMeta("integration", "low", "Gmail sync resumed"),
    "integration.embed.updated": _EventMeta("integration", "medium", "Embed configuration updated"),
    "integration.domain.added": _EventMeta("integration", "medium", "Allowed domain added"),
    "integration.embed_key.deleted": _EventMeta("integration", "medium", "Embed key removed"),
    "integration.embed_item.deleted": _EventMeta("integration", "medium", "Embed item removed"),
    "webhook.created": _EventMeta("integration", "medium", "Webhook created"),
    "webhook.updated": _EventMeta("integration", "medium", "Webhook updated"),
    "webhook.deleted": _EventMeta("integration", "medium", "Webhook deleted"),
    "webhook.secret.regenerated": _EventMeta("integration", "high", "Webhook secret rotated"),
    "crawl.source.created": _EventMeta("data", "medium", "Crawl source created"),
    "crawl.source.updated": _EventMeta("data", "low", "Crawl source updated"),
    "crawl.source.deleted": _EventMeta("data", "high", "Crawl source deleted"),
    "document.uploaded": _EventMeta("data", "low", "Document uploaded"),
    "document.deleted": _EventMeta("data", "high", "Document deleted"),
    "embedding.reindex.requested": _EventMeta("config", "high", "Embedding reindex requested"),
    "config.chat_model.updated": _EventMeta("config", "medium", "Chat model configuration updated"),
    "config.search_model.created": _EventMeta("config", "medium", "Search model profile created"),
    "config.search_model.deleted": _EventMeta("config", "high", "Search model profile deleted"),
    "config.chatbot.updated": _EventMeta("config", "medium", "Chatbot configuration updated"),
    "data.chat_history.exported": _EventMeta("data", "medium", "Chat history exported"),
    "data.feedback_moderation.exported": _EventMeta("data", "medium", "Feedback moderation exported"),
}


def request_client_meta(request: Optional[Request]) -> tuple[Optional[str], Optional[str]]:
    if request is None:
        return None, None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    else:
        ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    if ua and len(ua) > 512:
        ua = ua[:512]
    return ip, ua


def _persist_audit_event_payload(payload: Dict[str, Any]) -> None:
    db = SessionLocal()
    try:
        row = AuditEvent(**payload)
        db.add(row)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("audit persist failed event_type=%s: %s", payload.get("event_type"), exc)
    finally:
        db.close()


_DOCUMENT_UPLOAD_FAILURE_STATUSES = frozenset(
    {"Indexing Failed", "No Text Extracted", "Indexing Timed Out"}
)


def refresh_document_upload_audit(
    db: Session,
    *,
    document_id: str,
    doc_status: str,
    chunks_count: int,
) -> None:
    """Refresh upload audit details after background indexing completes."""
    row = (
        db.query(AuditEvent)
        .filter(
            AuditEvent.event_type == "document.uploaded",
            AuditEvent.resource_type == "document",
            AuditEvent.resource_id == str(document_id),
        )
        .order_by(AuditEvent.timestamp.desc())
        .first()
    )
    if not row:
        return

    existing = dict(row.details or {})
    if existing.get("status") == doc_status and existing.get("chunks") == chunks_count:
        return

    row.details = {**existing, "status": doc_status, "chunks": chunks_count}
    row.status = (
        "failure" if doc_status in _DOCUMENT_UPLOAD_FAILURE_STATUSES else "success"
    )
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("audit refresh failed document_id=%s: %s", document_id, exc)


def record_audit_event(
    *,
    event_type: str,
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
    api_key_id: Optional[uuid.UUID] = None,
    actor_type: str = "user",
    status: str = "success",
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    summary: Optional[str] = None,
    action: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    request_id: Optional[str] = None,
    severity: Optional[str] = None,
    db: Optional[Session] = None,
    background_tasks: Optional[BackgroundTasks] = None,
) -> None:
    if event_type not in V1_EVENT_TYPES:
        logger.warning("audit skipped unknown event_type=%s", event_type)
        return

    meta = EVENT_REGISTRY[event_type]
    payload: Dict[str, Any] = {
        "id": uuid.uuid4(),
        "project_id": project_id,
        "user_id": user_id,
        "api_key_id": api_key_id,
        "actor_type": actor_type,
        "event_type": event_type,
        "category": meta.category,
        "severity": severity or meta.severity,
        "status": status,
        "action": action or meta.action,
        "resource_type": resource_type,
        "resource_id": str(resource_id) if resource_id is not None else None,
        "summary": summary or action or meta.action,
        "details": details,
        "ip_address": ip_address,
        "user_agent": user_agent,
        "request_id": request_id,
    }

    if background_tasks is not None:
        background_tasks.add_task(_persist_audit_event_payload, payload)
        return

    if db is not None:
        try:
            db.add(AuditEvent(**payload))
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("audit persist failed event_type=%s: %s", event_type, exc)
        return

    _persist_audit_event_payload(payload)


def emit_audit(
    *,
    event_type: str,
    request: Optional[Request] = None,
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
    api_key_id: Optional[uuid.UUID] = None,
    actor_type: str = "user",
    status: str = "success",
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    summary: Optional[str] = None,
    action: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    background_tasks: Optional[BackgroundTasks] = None,
    db: Optional[Session] = None,
) -> None:
    ip, ua = request_client_meta(request)
    record_audit_event(
        event_type=event_type,
        user_id=user_id,
        project_id=project_id,
        api_key_id=api_key_id,
        actor_type=actor_type,
        status=status,
        resource_type=resource_type,
        resource_id=resource_id,
        summary=summary,
        action=action,
        details=details,
        ip_address=ip,
        user_agent=ua,
        background_tasks=background_tasks,
        db=db,
    )
