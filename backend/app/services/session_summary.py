"""Aggregate chat/search sessions for admin History and Feedback UIs."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Query, Session
from sqlalchemy import inspect as sa_inspect

from ..models import ChatMessage, ChatSessionMeta, Project
from .chat_session_meta import (
    ensure_chat_session_meta_table,
    get_transcript_emails_for_sessions,
)


def _preview_text(text: str, max_len: int = 120) -> str:
    t = (text or "").replace("\n", " ").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _hidden_from_widget_column_exists(db: Session) -> bool:
    try:
        inspector = sa_inspect(db.get_bind())
        cols = {c["name"] for c in inspector.get_columns("chat_messages")}
        return "hidden_from_widget" in cols
    except Exception:
        return False


def _apply_hidden_widget_filter(query: Query, db: Session) -> Query:
    if _hidden_from_widget_column_exists(db):
        return query.filter(ChatMessage.hidden_from_widget == False)  # noqa: E712
    return query


def _session_ids_matching_email_q(
    db: Session,
    *,
    project_id: uuid.UUID,
    message_type: str,
    q: str,
) -> List[str]:
    q_lower = q.strip().lower()
    if not q_lower:
        return []
    if not ensure_chat_session_meta_table(db):
        return []
    try:
        rows = (
            db.query(ChatSessionMeta)
            .filter(
                ChatSessionMeta.project_id == project_id,
                ChatSessionMeta.message_type == message_type,
            )
            .all()
        )
    except Exception:
        return []
    matched: List[str] = []
    for row in rows:
        if any(q_lower in (em or "").lower() for em in (row.transcript_emails or [])):
            matched.append(row.session_id)
    return matched


def _message_base_filters(
    db: Session,
    *,
    project: Project,
    message_type: str,
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    require_feedback: bool = False,
    user_id: Optional[int] = None,
) -> Query:
    clauses = [
        ChatMessage.project_id == project.id,
        ChatMessage.message_type == message_type,
    ]
    if user_id is not None:
        clauses.append(ChatMessage.user_id == user_id)
    if require_feedback:
        clauses.append(ChatMessage.feedback.isnot(None))
    base = db.query(ChatMessage).filter(and_(*clauses))
    base = _apply_hidden_widget_filter(base, db)
    if date_from:
        base = base.filter(ChatMessage.created_at >= date_from)
    if date_to:
        base = base.filter(ChatMessage.created_at <= date_to)
    return base


def _first_user_messages_by_session(
    db: Session,
    base: Query,
    session_ids: List[str],
) -> Dict[str, str]:
    if not session_ids:
        return {}
    out: Dict[str, str] = {}
    for sid in session_ids:
        row = (
            base.filter(ChatMessage.session_id == sid)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
            .first()
        )
        if row:
            out[sid] = _preview_text(row.user_message or "")
    return out


def list_session_summaries(
    db: Session,
    *,
    project: Project,
    message_type: str,
    q: Optional[str],
    date_from: Optional[datetime],
    date_to: Optional[datetime],
    limit: int,
    offset: int,
    require_feedback: bool = False,
    user_id: Optional[int] = None,
) -> Tuple[List[Dict[str, Any]], int]:
    base = _message_base_filters(
        db,
        project=project,
        message_type=message_type,
        date_from=date_from,
        date_to=date_to,
        require_feedback=require_feedback,
        user_id=user_id,
    )

    agg_query = (
        base.with_entities(
            ChatMessage.session_id.label("session_id"),
            func.count(ChatMessage.id).label("message_count"),
            func.max(ChatMessage.created_at).label("last_at"),
        )
        .group_by(ChatMessage.session_id)
    )

    if q and q.strip():
        pat = f"%{q.strip()}%"
        email_session_ids = _session_ids_matching_email_q(
            db,
            project_id=project.id,
            message_type=message_type,
            q=q,
        )
        msg_match = base.filter(
            or_(
                ChatMessage.user_message.ilike(pat),
                ChatMessage.assistant_response.ilike(pat),
            )
        ).with_entities(ChatMessage.session_id.distinct())
        msg_ids = {row[0] for row in msg_match.all()}
        allowed = msg_ids | set(email_session_ids)
        if not allowed:
            return [], 0
        agg_query = agg_query.filter(ChatMessage.session_id.in_(allowed))

    subq = agg_query.subquery()
    total = db.query(func.count()).select_from(subq).scalar() or 0

    rows = (
        db.query(subq)
        .order_by(subq.c.last_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    session_ids = [r.session_id for r in rows]
    previews = _first_user_messages_by_session(db, base, session_ids)
    emails_map = get_transcript_emails_for_sessions(
        db,
        project_id=project.id,
        session_ids=session_ids,
        message_type=message_type,
    )

    items: List[Dict[str, Any]] = []
    for r in rows:
        sid = r.session_id
        count = int(r.message_count or 0)
        item: Dict[str, Any] = {
            "session_id": sid,
            "preview": previews.get(sid, ""),
            "last_at": r.last_at.isoformat() if r.last_at else None,
            "message_count": count,
            "transcript_emails": emails_map.get(sid, []) if message_type == "chat" else [],
        }
        if require_feedback:
            item["feedback_count"] = count
        items.append(item)

    return items, int(total)
