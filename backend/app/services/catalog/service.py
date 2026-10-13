"""Entry point used by chat/search: question -> item context (or ``None``)."""
from __future__ import annotations

import logging
import time
from typing import List, Optional, Tuple

from . import is_enabled
from .answer_context import ItemContext
from .followup import Scope, asks_about_shown, brand_wide, catalog_wide, followup_queries, other_items_named
from .index import project_index
from .query import run

logger = logging.getLogger(__name__)


def _schedule_backfill(db, project_id: str) -> None:
    from sqlalchemy.orm import Session

    from .backfill import ensure_scheduled

    try:
        own = Session(bind=db.get_bind())
    except Exception:
        return
    try:
        ensure_scheduled(own, project_id)
    finally:
        own.close()


def _asks_about_site_topic(project_id: str, result) -> bool:
    """"Who is the founder of SUGAR Cosmetics?": a brand plus words no item carries is a
    missing model only when the site never uses those words; otherwise the pages answer it."""
    words = result.filters.get("unknown_terms") if result.mode == "missing" else None
    if not words:
        return False
    from ..rag.lexical_index import project_mentions

    return project_mentions(project_id, words)


def item_context_for(db, project_id: Optional[str], query: str, *, relax_terms: bool = False) -> Optional[ItemContext]:
    """Exact item rows for ``query`` in the project's catalog; never raises."""
    if not is_enabled() or not project_id or not (query or "").strip():
        return None
    start = time.perf_counter()
    _schedule_backfill(db, str(project_id))
    try:
        result = run(project_index(db, str(project_id)), query, relax_terms=relax_terms)
    except Exception as exc:
        logger.warning("catalog query failed project=%s: %s", project_id, exc)
        return None
    if result is None or _asks_about_site_topic(project_id, result):
        return None
    logger.info(
        "catalog: mode=%s total=%s rows=%s in %.1fms",
        result.mode, result.total, len(result.rows), (time.perf_counter() - start) * 1000,
    )
    return ItemContext(result, question=query)


def followup_queries_for(
    db, project_id: Optional[str], message: str, scope: Scope, *, is_followup: bool
) -> List[Tuple[str, bool]]:
    """Catalog queries carrying the previous item scope into ``message``; never raises."""
    if not is_enabled() or not project_id or not (message or "").strip():
        return []
    try:
        index = project_index(db, str(project_id))
        return followup_queries(index, message, scope, is_followup=is_followup) if index is not None else []
    except Exception as exc:
        logger.warning("catalog follow-up failed project=%s: %s", project_id, exc)
        return []


def other_items_named_for(db, project_id: Optional[str], message: str, scope: Scope) -> List[str]:
    """Item names a follow-up mentions in part besides the scope's items; never raises."""
    if not is_enabled() or not project_id or not (message or "").strip():
        return []
    try:
        index = project_index(db, str(project_id))
        return other_items_named(index, message, scope) if index is not None else []
    except Exception as exc:
        logger.warning("catalog item names failed project=%s: %s", project_id, exc)
        return []


def asks_about_shown_for(db, project_id: Optional[str], message: str, scope: Scope) -> bool:
    """Whether ``message`` asks about the scope's items without naming them; never raises."""
    if not is_enabled() or not project_id or not (message or "").strip():
        return False
    try:
        index = project_index(db, str(project_id))
        return index is not None and asks_about_shown(index, message, scope)
    except Exception as exc:
        logger.warning("catalog shown-items check failed project=%s: %s", project_id, exc)
        return False


def is_scope_wide(db, project_id: Optional[str], message: str) -> bool:
    """Whether ``message`` lists a whole brand's range or the whole catalog; never raises."""
    if not is_enabled() or not project_id or not (message or "").strip():
        return False
    try:
        index = project_index(db, str(project_id))
        return index is not None and (brand_wide(index, message) or catalog_wide(index, message))
    except Exception as exc:
        logger.warning("catalog brand scope failed project=%s: %s", project_id, exc)
        return False
