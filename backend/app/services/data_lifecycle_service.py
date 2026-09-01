"""
Centralized data erasure with provable deletion receipts.
"""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Union

from sqlalchemy import and_, delete, func, or_
from sqlalchemy.orm import Session

from ..models import AnalyticsDay, AuditEvent, ChatMessage, DeletionReceipt, QueryLog, User
from .audit_service import record_audit_event
from .session_store import SessionStore

logger = logging.getLogger(__name__)

BACKUP_NOTE = "Live data removed. Backups expire per operator backup policy."

RETENTION_MIN_DAYS = 7
RETENTION_MAX_DAYS = 365
RETENTION_DEFAULT_DAYS = 90

_session_store: Optional[SessionStore] = None


def _sessions() -> SessionStore:
    global _session_store
    if _session_store is None:
        from .session_store import get_session_store

        _session_store = get_session_store()
    return _session_store


def clamp_retention_days(days: int) -> int:
    return max(RETENTION_MIN_DAYS, min(RETENTION_MAX_DAYS, int(days)))


def _hash_message_ids(message_ids: List[uuid.UUID]) -> str:
    if not message_ids:
        return ""
    sample = sorted(str(mid) for mid in message_ids)[:100]
    return hashlib.sha256(",".join(sample).encode("utf-8")).hexdigest()[:32]


def _base_manifest(
    *,
    cutoff: Optional[datetime] = None,
    retention_days: Optional[int] = None,
    scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    manifest: Dict[str, Any] = {
        "counts": {},
        "stores_verified": ["postgresql"],
        "backup_note": BACKUP_NOTE,
    }
    if cutoff is not None:
        manifest["cutoff"] = cutoff.astimezone(timezone.utc).isoformat()
    if retention_days is not None:
        manifest["retention_days"] = retention_days
    if scope:
        manifest["scope"] = scope
    return manifest


def _create_receipt(
    db: Session,
    *,
    org_id: int,
    project_id: Optional[uuid.UUID],
    trigger_type: str,
    initiated_by_user_id: Optional[int],
    summary: str,
    manifest: Dict[str, Any],
    status: str = "completed",
    audit_event_type: Optional[str] = None,
    audit_project_id: Optional[uuid.UUID] = None,
) -> DeletionReceipt:
    now = datetime.now(timezone.utc)
    receipt = DeletionReceipt(
        id=uuid.uuid4(),
        org_id=org_id,
        project_id=project_id,
        trigger_type=trigger_type,
        initiated_by_user_id=initiated_by_user_id,
        initiated_at=now,
        completed_at=now if status == "completed" else None,
        status=status,
        summary=summary,
        manifest=manifest,
    )
    db.add(receipt)
    db.flush()

    if audit_event_type:
        record_audit_event(
            event_type=audit_event_type,
            user_id=initiated_by_user_id,
            project_id=audit_project_id,
            actor_type="system" if initiated_by_user_id is None else "user",
            resource_type="deletion_receipt",
            resource_id=str(receipt.id),
            summary=summary,
            details={
                "receipt_id": str(receipt.id),
                "trigger_type": trigger_type,
                "manifest": manifest,
            },
            db=db,
        )

    return receipt


def _delete_query_logs_for_messages(db: Session, message_ids: List[uuid.UUID]) -> int:
    if not message_ids:
        return 0
    result = db.execute(
        delete(QueryLog).where(QueryLog.chat_message_id.in_(message_ids))
    )
    return int(result.rowcount or 0)


def _purge_redis_sessions(session_ids: Set[str], scopes: Set[str]) -> int:
    purged = 0
    store = _sessions()
    for session_id in session_ids:
        for scope in scopes:
            try:
                store.delete(session_id, scope)
                purged += 1
            except Exception as exc:
                logger.debug("redis session purge failed %s/%s: %s", scope, session_id, exc)
    return purged


def delete_chat_message_hard(
    db: Session,
    message: ChatMessage,
    *,
    org_id: int,
    user_id: Optional[int],
    redis_scopes: Optional[Set[str]] = None,
) -> DeletionReceipt:
    """Hard-delete one chat/search message and linked query logs."""
    message_uuid = message.message_id
    session_id = message.session_id
    project_id = message.project_id
    msg_type = message.message_type or "chat"

    ql_count = _delete_query_logs_for_messages(db, [message_uuid])
    db.delete(message)
    db.flush()

    redis_keys = 0
    scopes = redis_scopes or set()
    if session_id and scopes:
        redis_keys = _purge_redis_sessions({session_id}, scopes)

    manifest = _base_manifest(
        scope={
            "message_id": str(message_uuid),
            "session_id": session_id,
            "message_type": msg_type,
            "message_ids_hash": _hash_message_ids([message_uuid]),
        }
    )
    manifest["counts"] = {
        "chat_messages": 1,
        "query_logs": ql_count,
        "redis_keys": redis_keys,
    }
    if redis_keys:
        manifest["stores_verified"].append("redis")

    audit_type = "data.search_message.deleted" if msg_type == "search" else "data.chat_message.deleted"
    summary = f"{'Search' if msg_type == 'search' else 'Chat'} message deleted ({message_uuid})"

    return _create_receipt(
        db,
        org_id=org_id,
        project_id=project_id,
        trigger_type="manual",
        initiated_by_user_id=user_id,
        summary=summary,
        manifest=manifest,
        audit_event_type=audit_type,
        audit_project_id=project_id,
    )


def delete_messages_hard(
    db: Session,
    messages: List[ChatMessage],
    *,
    org_id: int,
    user_id: Optional[int],
    trigger_type: str = "manual",
    redis_scopes: Optional[Set[str]] = None,
    summary: Optional[str] = None,
    audit_event_type: Optional[str] = None,
) -> DeletionReceipt:
    """Hard-delete multiple messages with one receipt."""
    if not messages:
        manifest = _base_manifest(scope={"message_ids_hash": ""})
        manifest["counts"] = {"chat_messages": 0, "query_logs": 0, "redis_keys": 0}
        return _create_receipt(
            db,
            org_id=org_id,
            project_id=None,
            trigger_type=trigger_type,
            initiated_by_user_id=user_id,
            summary=summary or "No messages to delete",
            manifest=manifest,
            audit_event_type=audit_event_type,
        )

    message_ids = [m.message_id for m in messages]
    project_id = messages[0].project_id
    session_ids = {m.session_id for m in messages if m.session_id}

    ql_count = _delete_query_logs_for_messages(db, message_ids)
    for msg in messages:
        db.delete(msg)
    db.flush()

    redis_keys = 0
    scopes = redis_scopes or set()
    if session_ids and scopes:
        redis_keys = _purge_redis_sessions(session_ids, scopes)

    manifest = _base_manifest(
        scope={
            "session_ids": sorted(session_ids)[:20],
            "message_ids_hash": _hash_message_ids(message_ids),
            "message_count": len(message_ids),
        }
    )
    manifest["counts"] = {
        "chat_messages": len(messages),
        "query_logs": ql_count,
        "redis_keys": redis_keys,
    }
    if redis_keys:
        manifest["stores_verified"].append("redis")

    return _create_receipt(
        db,
        org_id=org_id,
        project_id=project_id,
        trigger_type=trigger_type,
        initiated_by_user_id=user_id,
        summary=summary or f"Deleted {len(messages)} message(s)",
        manifest=manifest,
        audit_event_type=audit_event_type or "data.session.cleared",
        audit_project_id=project_id,
    )


def _org_audit_event_scope_filter(
    project_ids: List[uuid.UUID],
    org_user_ids: List[int],
):
    """Match project-scoped or account-scoped audit rows for one organization."""
    clauses = []
    if project_ids:
        clauses.append(AuditEvent.project_id.in_(project_ids))
    if org_user_ids:
        clauses.append(
            and_(AuditEvent.project_id.is_(None), AuditEvent.user_id.in_(org_user_ids))
        )
    if not clauses:
        return and_(AuditEvent.id.is_(None))
    return or_(*clauses)


def _org_user_ids(db: Session, org_id: int) -> List[int]:
    return [row[0] for row in db.query(User.id).filter(User.org_id == org_id).all()]


def count_org_audit_events_eligible(
    db: Session,
    *,
    org_id: int,
    project_ids: List[uuid.UUID],
    cutoff: datetime,
) -> int:
    """Count audit events older than cutoff that belong to the organization."""
    org_user_ids = _org_user_ids(db, org_id)
    return (
        db.query(AuditEvent)
        .filter(
            AuditEvent.timestamp < cutoff,
            _org_audit_event_scope_filter(project_ids, org_user_ids),
        )
        .count()
    )


def purge_org_audit_events(
    db: Session,
    *,
    org_id: int,
    project_ids: List[uuid.UUID],
    cutoff: datetime,
    dry_run: bool = False,
) -> int:
    """Hard-delete org-scoped audit events older than cutoff."""
    org_user_ids = _org_user_ids(db, org_id)
    query = db.query(AuditEvent).filter(
        AuditEvent.timestamp < cutoff,
        _org_audit_event_scope_filter(project_ids, org_user_ids),
    )
    count = query.count()
    if dry_run or count == 0:
        return count

    query.delete(synchronize_session=False)
    db.flush()
    return count


def purge_project_interaction_data(
    db: Session,
    *,
    org_id: int,
    project_id: uuid.UUID,
    cutoff: datetime,
    retention_days: int,
    initiated_by_user_id: Optional[int] = None,
    dry_run: bool = False,
) -> Dict[str, int]:
    """Purge chat/search history older than cutoff for one project."""
    counts = {
        "chat_messages": 0,
        "query_logs": 0,
        "analytics_days": 0,
        "redis_keys": 0,
    }

    msg_query = db.query(ChatMessage).filter(
        ChatMessage.project_id == project_id,
        ChatMessage.created_at < cutoff,
    )
    messages = msg_query.all()
    message_ids = [m.message_id for m in messages]
    session_ids = {m.session_id for m in messages if m.session_id}

    ql_filters = [QueryLog.project_id == project_id, QueryLog.timestamp < cutoff]
    if message_ids:
        ql_filters.append(QueryLog.chat_message_id.in_(message_ids))
    ql_query = db.query(QueryLog).filter(or_(*ql_filters))
    analytics_query = db.query(AnalyticsDay).filter(
        AnalyticsDay.project_id == project_id,
        AnalyticsDay.date < cutoff.replace(tzinfo=None) if cutoff.tzinfo else cutoff,
    )

    counts["chat_messages"] = len(messages)
    counts["query_logs"] = ql_query.count()
    counts["analytics_days"] = analytics_query.count()

    if dry_run:
        return counts

    if message_ids:
        _delete_query_logs_for_messages(db, message_ids)
    db.query(QueryLog).filter(
        QueryLog.project_id == project_id,
        QueryLog.timestamp < cutoff,
    ).delete(synchronize_session=False)
    for msg in messages:
        db.delete(msg)
    analytics_query.delete(synchronize_session=False)
    db.flush()

    # Best-effort Redis purge for widget sessions on this project
    widget_scope = f"w:{project_id}"
    if session_ids:
        counts["redis_keys"] = _purge_redis_sessions(session_ids, {widget_scope})

    manifest = _base_manifest(
        cutoff=cutoff,
        retention_days=retention_days,
        scope={"project_id": str(project_id)},
    )
    manifest["counts"] = counts
    if counts["redis_keys"]:
        manifest["stores_verified"].append("redis")

    _create_receipt(
        db,
        org_id=org_id,
        project_id=project_id,
        trigger_type="retention",
        initiated_by_user_id=initiated_by_user_id,
        summary=f"Retention purge: {counts['chat_messages']} messages older than {retention_days}d",
        manifest=manifest,
        audit_event_type="data.retention.purge.completed",
        audit_project_id=project_id,
    )
    return counts


def resolve_org_id_for_user(db: Session, user) -> int:
    """Return org_id for user; default org 1 for legacy installs."""
    if user.org_id:
        return int(user.org_id)
    from ..models import Organization

    org = db.query(Organization).order_by(Organization.id.asc()).first()
    return int(org.id) if org else 1
