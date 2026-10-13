"""Site-info pages (FAQ, policies, contact) of a project and their nearest chunks to a query.

Policy pages are a handful among hundreds of articles and products, so they often miss
the fused candidate pool entirely; this queries them directly. Document ids are cached
per project and reloaded when the knowledge-base generation changes (at most once per
``MIN_RELOAD_SECONDS``: crawls bump it on every page) or after ``CACHE_TTL_SECONDS``. Lookups
fail open: an error means "no info pages", never a failed answer.
"""
from __future__ import annotations

import logging
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

from . import kb_generation, page_kinds, scoped_query, source_availability

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 300.0
MIN_RELOAD_SECONDS = 60.0
MAX_INFO_DOCUMENTS = 200

_cache: Dict[str, Tuple[Optional[str], float, Tuple[str, ...]]] = {}
_lock = threading.Lock()

RankedList = scoped_query.RankedList


def _load(project_id: str) -> Tuple[str, ...]:
    from ...db import SessionLocal
    from ...models import CrawlSource, Document

    db = SessionLocal()
    try:
        rows = (
            db.query(Document.id, Document.url)
            .join(CrawlSource, CrawlSource.id == Document.source_id)
            .filter(
                CrawlSource.project_id == uuid.UUID(project_id),
                CrawlSource.use_in_answers.isnot(False),
            )
            .yield_per(2000)
        )
        ids = [str(doc_id) for doc_id, url in rows if page_kinds.classify_url(url) == page_kinds.KIND_INFO]
        return tuple(sorted(ids)[:MAX_INFO_DOCUMENTS])
    finally:
        db.close()


def info_document_ids(project_id: Optional[str]) -> Tuple[str, ...]:
    if not project_id:
        return ()
    key = str(project_id)
    generation = kb_generation.current()
    now = time.monotonic()
    with _lock:
        cached = _cache.get(key)
    if cached is not None:
        cached_gen, loaded_at, ids = cached
        age = now - loaded_at
        unchanged = generation is None or cached_gen == generation
        if age < MIN_RELOAD_SECONDS or (unchanged and age < CACHE_TTL_SECONDS):
            return ids
    try:
        ids = _load(key)
    except Exception as exc:
        logger.warning("info pages: lookup failed for project %s: %s", project_id, exc)
        ids = ()
    with _lock:
        _cache[key] = (generation, now, ids)
    return ids


def invalidate(project_id: Optional[str] = None) -> None:
    with _lock:
        if project_id is None:
            _cache.clear()
        else:
            _cache.pop(str(project_id), None)


def nearest_info_chunks(
    vdb: Any,
    embedding: Optional[List[float]],
    project_id: Optional[str],
    *,
    collection_name: Optional[str],
    top_k: int = 4,
) -> List[Dict[str, Any]]:
    """Closest site-info chunks as fusion entries (``doc``/``id``/``meta``/``dist``); [] on failure."""
    doc_ids = list(info_document_ids(project_id))
    if not doc_ids or embedding is None or vdb is None:
        return []
    where: Dict[str, Any] = {"$and": [{"document_id": {"$in": doc_ids}}, {"project_id": str(project_id)}]}
    try:
        docs, ids, metas, dists = scoped_query.query_where(
            vdb, embedding, where, top_k=top_k, collection_name=collection_name
        )
    except Exception as exc:
        logger.warning("info pages: chunk query failed for project %s: %s", project_id, exc)
        return []
    disabled = source_availability.disabled_source_ids(project_id)
    entries = [
        {"doc": d, "id": i, "meta": m, "dist": float(x) if x is not None else 1.0}
        for d, i, m, x in zip(docs, ids, metas, dists)
    ]
    return source_availability.drop_entries(entries, disabled)
