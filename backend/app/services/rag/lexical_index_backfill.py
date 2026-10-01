"""Populate the keyword sidecar index from existing Chroma chunks.

Read-only against Chroma and idempotent (upserts keyed by collection + chunk id), so it
is safe to re-run at any time. Collections whose index row count already matches the
Chroma count are skipped.

Manual run (inside the backend container / venv):
    python -m app.services.rag.lexical_index_backfill
"""
from __future__ import annotations

import logging
import time
from typing import Dict, Optional

from . import lexical_index

logger = logging.getLogger(__name__)

PAGE_SIZE = 500
_PAGE_PAUSE_SECONDS = 0.05


def _vdb():
    from .singleton import get_pipeline

    return get_pipeline().rag.retriever.vdb


def backfill_collection(collection_name: str, vdb=None, page_size: int = PAGE_SIZE) -> int:
    """Index every chunk of one collection. Returns rows written."""
    from .singleton import chroma_read_lock

    vdb = vdb or _vdb()
    coll = vdb.get_collection(collection_name)
    total = int(coll.count() or 0)
    if total <= 0:
        return 0
    if lexical_index.count_rows(collection_name) >= total:
        return 0

    written = 0
    offset = 0
    while offset < total:
        with chroma_read_lock(collection_name):
            page = coll.get(limit=page_size, offset=offset, include=["documents", "metadatas"])
        ids = page.get("ids") or []
        if not ids:
            break
        written += lexical_index.upsert_chunks(
            collection_name, ids, page.get("documents") or [], page.get("metadatas") or []
        )
        offset += len(ids)
        time.sleep(_PAGE_PAUSE_SECONDS)
    logger.info("lexical index backfill: %s -> %d/%d chunks indexed", collection_name, written, total)
    return written


def backfill_all(vdb=None) -> Dict[str, int]:
    """Index every known collection; per-collection failures are logged and skipped."""
    if not lexical_index.is_enabled():
        logger.info("lexical index backfill skipped (disabled or table missing)")
        return {}
    vdb = vdb or _vdb()
    results: Dict[str, int] = {}
    for name in vdb.list_known_collections() or []:
        try:
            results[name] = backfill_collection(name, vdb=vdb)
        except Exception as exc:
            logger.warning("lexical index backfill failed for %s: %s", name, exc)
    return results


def run_locked_backfill(redis_client: Optional[object] = None) -> None:
    """Scheduler entry point: one instance at a time across workers."""
    from ..scheduler import _try_acquire_scheduler_lock

    if not _try_acquire_scheduler_lock(redis_client, "lexical_index_backfill", ttl_seconds=6 * 60 * 60):
        return
    try:
        backfill_all()
    except Exception as exc:
        logger.warning("lexical index backfill run failed: %s", exc)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(backfill_all())
