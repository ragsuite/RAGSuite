"""How vector queries talk to Chroma: tenant-filter skip and one retry on stale connections.

Tenant-filter skip: a project's own collection (``proj_<id>__...``) normally holds only
that project's chunks, yet a ``where {user_id, project_id}`` filter makes Chroma's HNSW
search several seconds slower. The query runs unfiltered, and every returned row is
checked against the filter with the same strict equality Chroma applies. If all rows
match they are exactly the filtered top-k; otherwise the caller re-runs the filtered
query and the collection is remembered as mixed for a while.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Callable, Dict, Optional, Sequence, Tuple, TypeVar

from .embedder_factory import project_collection_prefix

logger = logging.getLogger(__name__)

T = TypeVar("T")
MIXED_TTL_SECONDS = 900.0
_mixed: Dict[Tuple[str, Optional[int], str], float] = {}
_mixed_lock = threading.Lock()


def _enabled() -> bool:
    return os.getenv("RAG_TENANT_FILTER_SKIP", "true").strip().lower() not in {"0", "false", "no", "off"}


def _key(collection_name: str, user_id: Optional[int], project_id: Any) -> Tuple[str, Optional[int], str]:
    return (collection_name, user_id, str(project_id))


def can_skip_filter(collection_name: Optional[str], user_id: Optional[int], project_id: Any) -> bool:
    if not (_enabled() and collection_name and project_id is not None):
        return False
    if not collection_name.startswith(project_collection_prefix(str(project_id))):
        return False
    key = _key(collection_name, user_id, project_id)
    with _mixed_lock:
        until = _mixed.get(key)
        if until is None:
            return True
        if until > time.monotonic():
            return False
        _mixed.pop(key, None)
        return True


def mark_mixed(collection_name: str, user_id: Optional[int], project_id: Any) -> None:
    with _mixed_lock:
        _mixed[_key(collection_name, user_id, project_id)] = time.monotonic() + MIXED_TTL_SECONDS
    logger.info("Tenant filter required for %s (rows outside user/project seen)", collection_name)


def rows_match_tenant(metadatas: Sequence[Any], user_id: Optional[int], project_id: Any) -> bool:
    project = str(project_id)
    for meta in metadatas:
        if not isinstance(meta, dict):
            return False
        if meta.get("project_id") != project:
            return False
        if user_id is not None and meta.get("user_id") != user_id:
            return False
    return True


def is_stale_connection_error(exc: BaseException) -> bool:
    text = f"{type(exc).__name__}: {exc}".lower()
    return (
        "remoteprotocolerror" in text
        or "server disconnected" in text
        or "connection reset" in text
    )


def retry_stale_connection(fn: Callable[[], T]) -> T:
    """Run an idempotent call once more when Chroma dropped an idle keep-alive connection."""
    try:
        return fn()
    except Exception as exc:
        if not is_stale_connection_error(exc):
            raise
        logger.info("Chroma connection was stale (%s); retrying once", exc)
        return fn()
