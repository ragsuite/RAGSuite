"""Chroma embedding coverage for the crawl Sources table, shared across polls.

The Sources page polls while a crawl runs. A coverage scan probes every Chroma
collection and keeps running after the request stops waiting for it, so starting one
scan per poll stacks scans until Chroma has no capacity left for chat retrieval.
At most one scan per project and source set runs at a time; its result is reused for
``CACHE_TTL_SECONDS`` and served stale while a newer scan is still running.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Any, Dict, FrozenSet, Iterable, Tuple

logger = logging.getLogger(__name__)

CACHE_TTL_SECONDS = 30.0
_MAX_ENTRIES = 256

_Key = Tuple[str, FrozenSet[str]]

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="crawl-sites-chroma")
_lock = threading.Lock()
_inflight: Dict[_Key, Future] = {}
_cache: Dict[_Key, Tuple[float, Dict[str, Any]]] = {}


def embedded_models(project_id: Any, candidate_ids: Iterable[str], timeout: float) -> Dict[str, Any]:
    """Coverage by source id; the last known coverage (``{}`` if none) when the scan is slow or fails."""
    key: _Key = (str(project_id), frozenset(str(i) for i in candidate_ids))
    with _lock:
        cached = _cache.get(key)
        if cached and time.monotonic() - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]
        future = _inflight.get(key)
        if future is None:
            future = _executor.submit(_scan, key)
            _inflight[key] = future
    fallback = "last known indexed-model labels" if cached else "DB rows without indexed-model labels"
    try:
        return future.result(timeout=timeout)
    except FuturesTimeout:
        logger.warning(
            "list_crawl_sources: Chroma enrichment timed out for project %s (%s sources); returning %s",
            key[0], len(key[1]), fallback,
        )
    except Exception:
        logger.exception(
            "list_crawl_sources: Chroma enrichment failed for project %s; returning %s", key[0], fallback,
        )
    return cached[1] if cached else {}


def clear() -> None:
    """Forget cached coverage (scans already running still finish)."""
    with _lock:
        _cache.clear()


def _scan(key: _Key) -> Dict[str, Any]:
    from .reindex_service import embedded_models_by_item_id

    try:
        result = embedded_models_by_item_id(key[0], candidate_ids=set(key[1]))
        with _lock:
            if key not in _cache and len(_cache) >= _MAX_ENTRIES:
                del _cache[min(_cache, key=lambda k: _cache[k][0])]
            _cache[key] = (time.monotonic(), result)
        return result
    finally:
        with _lock:
            _inflight.pop(key, None)
