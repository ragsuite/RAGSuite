"""How many chunks of a collection were embedded with an older chunk-context version.

A full metadata scan of a large collection takes seconds, so status requests read a
cached result and refresh it in the background (one scan per collection at a time).

Manual run (inside the backend container / venv):
    python -m app.services.rag.chunk_context_coverage <collection_name>
"""
from __future__ import annotations

import logging
import sys
import threading
import time
from typing import Any, Dict, Optional

from .chunk_context import CHUNK_CONTEXT_VERSION, CHUNK_CONTEXT_VERSION_LLM

logger = logging.getLogger(__name__)

PAGE_SIZE = 500
CACHE_TTL_SECONDS = 600.0

_cache: Dict[str, tuple[float, Dict[str, int]]] = {}
_running: set[str] = set()
_lock = threading.Lock()


def _version(meta: Any) -> int:
    try:
        return int((meta or {}).get("chunk_ctx_v") or 0)
    except (TypeError, ValueError, AttributeError):
        return 0


def summarize(metadatas) -> Dict[str, int]:
    counts = {"total": 0, "outdated": 0, "llm_context": 0}
    for meta in metadatas:
        version = _version(meta)
        counts["total"] += 1
        if version < CHUNK_CONTEXT_VERSION:
            counts["outdated"] += 1
        if version >= CHUNK_CONTEXT_VERSION_LLM:
            counts["llm_context"] += 1
    return counts


def scan_collection(collection_name: str, vdb=None) -> Dict[str, int]:
    from .singleton import chroma_read_lock, get_pipeline

    vdb = vdb or get_pipeline().vdb
    coll = vdb.get_collection(collection_name)
    totals = {"total": 0, "outdated": 0, "llm_context": 0}
    offset = 0
    while True:
        with chroma_read_lock(collection_name):
            page = coll.get(limit=PAGE_SIZE, offset=offset, include=["metadatas"])
        metas = page.get("metadatas") or []
        if not metas:
            break
        for key, value in summarize(metas).items():
            totals[key] += value
        offset += len(metas)
    with _lock:
        _cache[collection_name] = (time.monotonic(), totals)
    return totals


def _refresh(collection_name: str) -> None:
    try:
        scan_collection(collection_name)
    except Exception as exc:
        logger.warning("chunk context coverage scan failed for %s: %s", collection_name, exc)
    finally:
        with _lock:
            _running.discard(collection_name)


def cached_counts(collection_name: str) -> Optional[Dict[str, int]]:
    """Last known counts (``None`` until the first scan finishes); refreshes when stale."""
    if not collection_name:
        return None
    with _lock:
        hit = _cache.get(collection_name)
        stale = hit is None or time.monotonic() - hit[0] > CACHE_TTL_SECONDS
        start = stale and collection_name not in _running
        if start:
            _running.add(collection_name)
    if start:
        threading.Thread(
            target=_refresh, args=(collection_name,), name="chunk-ctx-coverage", daemon=True
        ).start()
    return dict(hit[1]) if hit else None


def invalidate(collection_name: Optional[str] = None) -> None:
    with _lock:
        if collection_name is None:
            _cache.clear()
        else:
            _cache.pop(collection_name, None)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    for name in sys.argv[1:]:
        print(name, scan_collection(name))
