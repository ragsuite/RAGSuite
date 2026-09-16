"""Per-project history storage guards and session TTL helpers."""
from __future__ import annotations

import uuid
from typing import Optional, Union

from sqlalchemy.orm import Session

from ..models import ChatbotSettings, SearchSettings

HISTORY_ON_TTL = 1800  # 30 minutes sliding
HISTORY_OFF_TTL = 900  # 15 minutes sliding


def session_ttl_seconds(history_enabled: bool) -> int:
    return HISTORY_ON_TTL if history_enabled else HISTORY_OFF_TTL


def _coerce_project_uuid(project_id: Union[uuid.UUID, str, None]) -> Optional[uuid.UUID]:
    if project_id is None:
        return None
    if isinstance(project_id, uuid.UUID):
        return project_id
    try:
        return uuid.UUID(str(project_id))
    except (ValueError, TypeError):
        return None


def is_chat_history_enabled(db: Session, project_id: Union[uuid.UUID, str, None]) -> bool:
    pid = _coerce_project_uuid(project_id)
    if pid is None:
        return True
    row = (
        db.query(ChatbotSettings.store_history_enabled)
        .filter(ChatbotSettings.project_id == pid)
        .order_by(ChatbotSettings.updated_at.desc())
        .first()
    )
    if row is None:
        return True
    return bool(row[0])


def is_search_history_enabled(db: Session, project_id: Union[uuid.UUID, str, None]) -> bool:
    pid = _coerce_project_uuid(project_id)
    if pid is None:
        return True
    row = (
        db.query(SearchSettings.store_history_enabled)
        .filter(SearchSettings.project_id == pid)
        .order_by(SearchSettings.updated_at.desc())
        .first()
    )
    if row is None:
        return True
    return bool(row[0])


def should_persist_chat(db: Session, project_id: Union[uuid.UUID, str, None]) -> bool:
    return is_chat_history_enabled(db, project_id)


def should_persist_search(db: Session, project_id: Union[uuid.UUID, str, None]) -> bool:
    return is_search_history_enabled(db, project_id)


def chat_session_ttl(db: Session, project_id: Union[uuid.UUID, str, None]) -> int:
    return session_ttl_seconds(is_chat_history_enabled(db, project_id))


def search_session_ttl(db: Session, project_id: Union[uuid.UUID, str, None]) -> int:
    return session_ttl_seconds(is_search_history_enabled(db, project_id))


def build_session_scope(auth: dict, project_id: Union[uuid.UUID, str, None] = None) -> str:
    """Redis namespace for chat/search ephemeral sessions.

    Widget: ``w:{project_id}``
    API key: ``k:{api_key_id}`` (key is already project-bound)
    User: ``u:{user_id}:p:{project_id}`` when project is known, else legacy ``u:{user_id}``
    """
    auth_type = auth.get("type")
    if auth_type == "widget":
        pid = project_id if project_id is not None else auth.get("project_id", "")
        return f"w:{str(pid)}"
    if auth_type == "api_key" and "api_key" in auth:
        return f"k:{auth['api_key'].id}"
    uid = auth.get("user_id", "")
    pid = project_id if project_id is not None else auth.get("project_id")
    if pid is not None and str(pid).strip() != "":
        return f"u:{uid}:p:{pid}"
    return f"u:{uid}"


def user_redis_scopes(user_id: Union[int, str], project_id: Union[uuid.UUID, str, None] = None) -> set:
    """Scopes to purge for a user session — includes legacy ``u:{id}`` and project-scoped keys."""
    scopes = {f"u:{user_id}"}
    if project_id is not None and str(project_id).strip() != "":
        scopes.add(f"u:{user_id}:p:{project_id}")
    return scopes
