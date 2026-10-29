"""Drop retrieved chunks whose URL matches the owning crawl source's denylist.

Fails open: a lookup error means "nothing denied", never "no answers".
"""
from __future__ import annotations

import logging
import re
import threading
import time
import uuid
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple

from ..crawl_url_patterns import matches_url_pattern
from . import kb_generation, source_availability

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30.0
_FAILED = "\x00failed"
_CRAWL_SOURCE_FILE_RE = re.compile(r"crawl_source_([0-9a-fA-F-]{36})", re.IGNORECASE)

RankedList = source_availability.RankedList
Denylists = Dict[str, Tuple[str, ...]]

_cache: Dict[str, Tuple[Optional[str], float, Denylists]] = {}
_lock = threading.Lock()
NOTHING: Denylists = {}


def _as_patterns(value: Any) -> Tuple[str, ...]:
    if not isinstance(value, (list, tuple)):
        return ()
    return tuple(
        p.strip()
        for p in value
        if isinstance(p, str) and p.strip() and p.strip().lower() != "string"
    )


def _load(project_id: str) -> Denylists:
    from ...db import SessionLocal
    from ...models import CrawlSource

    pid = uuid.UUID(project_id)
    db = SessionLocal()
    try:
        rows = db.query(CrawlSource.id, CrawlSource.denylist).filter(
            CrawlSource.project_id == pid
        ).all()
        found: Denylists = {}
        for source_id, denylist in rows:
            patterns = _as_patterns(denylist)
            if patterns:
                found[str(source_id).lower()] = patterns
        return found
    finally:
        db.close()


def for_project(project_id: Optional[str]) -> Denylists:
    """Source-id → denylist patterns for the project; empty on any failure."""
    if not project_id:
        return NOTHING
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
        logger.warning("denylist filter: lookup failed for project %s: %s", project_id, exc)
        found, stamp = NOTHING, _FAILED
    with _lock:
        _cache[key] = (stamp, now, found)
    return found


def invalidate(project_id: Optional[str] = None) -> None:
    with _lock:
        if project_id is None:
            _cache.clear()
        else:
            _cache.pop(str(project_id), None)


def chunk_crawl_source_id(meta: Any) -> str:
    if not isinstance(meta, dict):
        return ""
    sid = str(meta.get("crawl_source_id") or "").strip().lower()
    if sid:
        return sid
    match = _CRAWL_SOURCE_FILE_RE.match(str(meta.get("source_file") or ""))
    return match.group(1).lower() if match else ""


def chunk_url(meta: Any) -> str:
    if not isinstance(meta, dict):
        return ""
    return str(meta.get("url") or meta.get("source_url") or "").strip()


def is_denied_chunk(meta: Any, denylists: Mapping[str, Sequence[str]]) -> bool:
    if not denylists:
        return False
    sid = chunk_crawl_source_id(meta)
    patterns = denylists.get(sid)
    if not patterns:
        return False
    url = chunk_url(meta)
    if not url:
        return False
    return any(matches_url_pattern(url, pattern) for pattern in patterns)


def drop_ranked(lists: RankedList, denylists: Mapping[str, Sequence[str]]) -> RankedList:
    """Ranked ``(docs, ids, metas, dists)`` without denylisted chunk URLs."""
    if not denylists:
        return lists
    docs, ids, metas, dists = lists
    keep = [i for i, meta in enumerate(metas) if not is_denied_chunk(meta, denylists)]
    if len(keep) == len(metas):
        return lists
    return (
        [docs[i] for i in keep if i < len(docs)],
        [ids[i] for i in keep if i < len(ids)],
        [metas[i] for i in keep],
        [dists[i] for i in keep if i < len(dists)],
    )


def drop_entries(entries: List[Dict[str, Any]], denylists: Mapping[str, Sequence[str]]) -> List[Dict[str, Any]]:
    if not denylists:
        return entries
    return [e for e in entries if not is_denied_chunk(e.get("meta"), denylists)]
