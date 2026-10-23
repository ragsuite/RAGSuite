"""Keep Top K and the reranker toggle identical across a project's settings rows.

Settings rows are stored per user, but Chat and the Search widget read the
canonical (owner-first) row, so a save by any admin is copied to every row of
that surface. Similarity threshold and max tokens depend on the chosen models
and are synced from Model Configuration by ``project_model_provider_sync``.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Literal, Mapping, Optional, Tuple

from sqlalchemy.orm import Session

from ..models import ChatbotSettings, SearchSettings

logger = logging.getLogger(__name__)

Surface = Literal["chat", "search"]
RETRIEVAL_FIELDS: Tuple[str, ...] = ("top_k", "use_reranker", "rerank_candidates", "threshold_preset", "keyword_blend")
_SETTINGS_MODELS: Dict[Surface, Any] = {"chat": ChatbotSettings, "search": SearchSettings}

# Chat runtime value when ``chat_top_k`` is NULL (see the chat routes in ``routes/rag.py``).
DEFAULT_CHAT_TOP_K = 5


def retrieval_columns(surface: Surface) -> Tuple[str, ...]:
    return tuple(f"{surface}_{field}" for field in RETRIEVAL_FIELDS)


def touches_retrieval_settings(surface: Surface, update_data: Mapping[str, Any]) -> bool:
    return any(column in update_data for column in retrieval_columns(surface))


def canonical_retrieval_row(db: Session, project_id: Any, surface: Surface) -> Optional[Any]:
    """The settings row Chat and the Search widget read Top K and the reranker from."""
    if project_id is None:
        return None
    from .rag.embedding_resolver import read_project_chatbot_settings, read_project_search_settings

    reader = read_project_chatbot_settings if surface == "chat" else read_project_search_settings
    return reader(db, project_id)


def any_reranker_enabled(db: Session) -> bool:
    for surface, model in _SETTINGS_MODELS.items():
        column = getattr(model, f"{surface}_use_reranker")
        if db.query(model.id).filter(column.is_(True)).first() is not None:
            return True
    return False


def propagate_retrieval_settings(db: Session, project_id: Any, surface: Surface, source_row: Any) -> int:
    """Copy ``source_row``'s Top K and reranker values to the project's other rows.

    Returns the number of rows changed; commits only when something changed.
    """
    model = _SETTINGS_MODELS[surface]
    values = {column: getattr(source_row, column) for column in retrieval_columns(surface)}
    changed = 0
    rows = db.query(model).filter(model.project_id == project_id, model.id != source_row.id).all()
    for row in rows:
        row_changed = False
        for column, value in values.items():
            if getattr(row, column) != value:
                setattr(row, column, value)
                row_changed = True
        changed += int(row_changed)
    if changed:
        db.commit()
        logger.info(
            "Synced %s retrieval settings %s to %d other row(s) in project %s",
            surface,
            values,
            changed,
            project_id,
        )
    return changed
