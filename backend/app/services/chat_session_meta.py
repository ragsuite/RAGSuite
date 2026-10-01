"""Persist per-session metadata (e.g. transcript email recipients).

Table creation does **not** require ``alembic upgrade`` on the server:
startup ``create_tables()`` already runs ``Base.metadata.create_all``, and
``ensure_chat_session_meta_table`` lazily creates the table on first use
(checkfirst). Existing chat_messages / history data are never modified.
"""
from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from ..models import ChatSessionMeta

logger = logging.getLogger(__name__)

_ensure_lock = threading.Lock()
_table_ready: Optional[bool] = None


def normalize_transcript_email(email: str) -> str:
    return (email or "").strip().lower()


def chat_session_meta_table_exists(db: Session) -> bool:
    try:
        inspector = sa_inspect(db.get_bind())
        return inspector.has_table(ChatSessionMeta.__tablename__)
    except Exception:
        return False


def ensure_chat_session_meta_table(db: Session) -> bool:
    """Ensure ``chat_session_meta`` exists without Alembic.

    Safe for concurrent callers; never drops or alters existing tables/data.
    Returns True when the table is available for read/write.
    """
    global _table_ready
    if _table_ready is True:
        return True

    with _ensure_lock:
        if _table_ready is True:
            return True
        try:
            bind = db.get_bind()
            inspector = sa_inspect(bind)
            if inspector.has_table(ChatSessionMeta.__tablename__):
                _table_ready = True
                return True
            ChatSessionMeta.__table__.create(bind=bind, checkfirst=True)
            _table_ready = True
            logger.info("Created chat_session_meta table (no Alembic required)")
            return True
        except Exception as exc:
            logger.warning(
                "chat_session_meta unavailable (email persist/summary emails skipped): %s",
                str(exc).split("\n")[0],
            )
            _table_ready = False
            return False


def append_transcript_email_if_persisting(
    db: Session,
    *,
    project_id: uuid.UUID,
    session_id: str,
    email: str,
    message_type: str = "chat",
) -> None:
    """Append normalized email to session meta (dedupe within session).

    No-ops if the meta table cannot be ensured — transcript send still succeeds.
    """
    normalized = normalize_transcript_email(email)
    if not normalized or not session_id.strip():
        return
    if not ensure_chat_session_meta_table(db):
        return

    sid = session_id.strip()
    try:
        row = (
            db.query(ChatSessionMeta)
            .filter(
                ChatSessionMeta.project_id == project_id,
                ChatSessionMeta.session_id == sid,
                ChatSessionMeta.message_type == message_type,
            )
            .first()
        )
        if row is None:
            row = ChatSessionMeta(
                project_id=project_id,
                session_id=sid,
                message_type=message_type,
                transcript_emails=[normalized],
            )
            db.add(row)
            db.flush()
            return

        emails: List[str] = list(row.transcript_emails or [])
        if normalized not in emails:
            emails.append(normalized)
            row.transcript_emails = emails
        row.updated_at = datetime.now(timezone.utc)
    except Exception as exc:
        logger.warning(
            "Failed to append transcript email for session %s: %s",
            sid,
            str(exc).split("\n")[0],
        )


def get_transcript_emails_for_sessions(
    db: Session,
    *,
    project_id: uuid.UUID,
    session_ids: List[str],
    message_type: str = "chat",
) -> dict[str, List[str]]:
    if not session_ids:
        return {}
    if not ensure_chat_session_meta_table(db):
        return {}
    try:
        rows = (
            db.query(ChatSessionMeta)
            .filter(
                ChatSessionMeta.project_id == project_id,
                ChatSessionMeta.message_type == message_type,
                ChatSessionMeta.session_id.in_(session_ids),
            )
            .all()
        )
    except Exception as exc:
        logger.warning(
            "Failed to load transcript emails: %s",
            str(exc).split("\n")[0],
        )
        return {}
    out: dict[str, List[str]] = {}
    for row in rows:
        out[row.session_id] = list(row.transcript_emails or [])
    return out
