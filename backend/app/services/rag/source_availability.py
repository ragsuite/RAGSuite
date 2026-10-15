"""Sources an admin switched off for answers ("Use in answers"), applied at query time.

Covers crawl sources (websites / sitemaps) and uploaded sources (Document, Text, Q&A Pairs).
A disabled source keeps its pages and vectors; retrieval just never returns its chunks.
The disabled set is cached per project and reloaded whenever the shared knowledge-base
generation changes (toggling bumps it), or after ``CACHE_TTL_SECONDS`` without Redis.
Lookups fail open: an error means "nothing disabled", never "no answers".
"""
from __future__ import annotations

import logging
import os
import threading
import time
import uuid
from typing import Any, Dict, FrozenSet, Iterable, List, NamedTuple, Optional, Tuple

from . import kb_generation, source_routing

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30.0
CRAWL_SOURCE_FILE_PREFIX = "crawl_source_"
_FAILED = "\x00failed"


class Disabled(NamedTuple):
    """Lower-cased ids switched off for answers, by kind."""

    crawl_sources: FrozenSet[str] = frozenset()
    # Uploaded-document ids; their chunks carry them as ``document_id``.
    documents: FrozenSet[str] = frozenset()

    @property
    def ids(self) -> FrozenSet[str]:
        return self.crawl_sources | self.documents


NOTHING_DISABLED = Disabled()

_cache: Dict[str, Tuple[Optional[str], float, Disabled]] = {}
_lock = threading.Lock()

RankedList = Tuple[List[Any], List[Any], List[Any], List[Any]]


def prefilter_enabled() -> bool:
    """Exclude in the vector / keyword query itself (off: post-filter with over-fetch only)."""
    return os.getenv("SOURCE_EXCLUSION_PREFILTER", "true").strip().lower() not in {"0", "false", "no", "off"}


def _load(project_id: str) -> Disabled:
    from ...db import SessionLocal
    from ...models import CrawlSource, UploadedDocument

    pid = uuid.UUID(project_id)
    db = SessionLocal()
    try:
        crawl = db.query(CrawlSource.id).filter(
            CrawlSource.project_id == pid, CrawlSource.use_in_answers.is_(False)
        )
        uploaded = db.query(UploadedDocument.id).filter(
            UploadedDocument.project_id == pid, UploadedDocument.use_in_answers.is_(False)
        )
        return Disabled(
            crawl_sources=frozenset(str(row[0]).lower() for row in crawl.all()),
            documents=frozenset(str(row[0]).lower() for row in uploaded.all()),
        )
    finally:
        db.close()


def disabled(project_id: Optional[str]) -> Disabled:
    """The project's sources excluded from answers; nothing on any failure."""
    if not project_id:
        return NOTHING_DISABLED
    key = str(project_id)
    generation = kb_generation.current()
    now = time.monotonic()
    with _lock:
        cached = _cache.get(key)
    if cached is not None:
        cached_gen, loaded_at, found = cached
        within_ttl = now - loaded_at < CACHE_TTL_SECONDS
        fresh = within_ttl if generation is None or cached_gen == _FAILED else cached_gen == generation
        if fresh:
            return found
    try:
        found = _load(key)
        stamp = generation
    except Exception as exc:
        logger.warning("source availability: lookup failed for project %s: %s", project_id, exc)
        found, stamp = NOTHING_DISABLED, _FAILED
    with _lock:
        _cache[key] = (stamp, now, found)
    return found


def disabled_source_ids(project_id: Optional[str]) -> FrozenSet[str]:
    """Ids of every source (crawl or uploaded) excluded from answers; empty on any failure."""
    return disabled(project_id).ids


def invalidate(project_id: Optional[str] = None) -> None:
    with _lock:
        if project_id is None:
            _cache.clear()
        else:
            _cache.pop(str(project_id), None)


def excluded_source_files(source_ids: Iterable[str]) -> List[str]:
    """``source_file`` values of crawl chunks for ``source_ids`` (sorted, stable for caches)."""
    return sorted(f"{CRAWL_SOURCE_FILE_PREFIX}{sid}" for sid in source_ids)


def metadata_exclusion(source_ids: Iterable[str]) -> Optional[Dict[str, Any]]:
    files = excluded_source_files(source_ids)
    return {"source_file": {"$nin": files}} if files else None


def prune_ids(ids: List[str], disabled: FrozenSet[str]) -> List[str]:
    """Routed / hard-scope source ids without the disabled ones (order preserved)."""
    if not disabled:
        return ids
    return [i for i in ids if str(i).lower() not in disabled]


def is_disabled_chunk(meta: Any, disabled: FrozenSet[str]) -> bool:
    return bool(disabled) and source_routing.chunk_belongs_to(meta, set(disabled))


def drop_ranked(lists: RankedList, disabled: FrozenSet[str]) -> RankedList:
    """Ranked ``(docs, ids, metas, dists)`` without chunks of disabled sources."""
    if not disabled:
        return lists
    docs, ids, metas, dists = lists
    keep = [i for i, meta in enumerate(metas) if not is_disabled_chunk(meta, disabled)]
    if len(keep) == len(metas):
        return lists
    return (
        [docs[i] for i in keep if i < len(docs)],
        [ids[i] for i in keep if i < len(ids)],
        [metas[i] for i in keep],
        [dists[i] for i in keep if i < len(dists)],
    )


def drop_entries(entries: List[Dict[str, Any]], disabled: FrozenSet[str]) -> List[Dict[str, Any]]:
    if not disabled:
        return entries
    return [e for e in entries if not is_disabled_chunk(e.get("meta"), disabled)]
