"""Per-item embedding coverage for the request path, shared across callers.

A coverage pass probes every Chroma collection of the project. While another source is
indexing, Chroma serves those reads slowly enough that one pass can outlast the browser
timeout; the abandoned pass keeps running and every retry would start another one. At
most one pass per project, source and cache mode runs at a time. A caller that cannot
wait for it gets the last completed result; with none yet, ``CoveragePending``.
"""
from __future__ import annotations

import logging
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Any, Dict, Literal, Tuple

from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)

# First pass for a project: stay under the dashboard's 60s request timeout.
FIRST_PASS_WAIT_SECONDS = 45.0
# A last known result exists: answer quickly and let the pass refresh it.
REFRESH_WAIT_SECONDS = 8.0
_MAX_ENTRIES = 256

_LastKey = Tuple[str, str]
_FlightKey = Tuple[str, str, bool]

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="item-coverage")
_lock = threading.Lock()
_inflight: Dict[_FlightKey, Future] = {}
_last: Dict[_LastKey, Dict[str, Any]] = {}


class CoveragePending(RuntimeError):
    """No coverage result is available yet; the pass is still running."""


def item_coverage(
    db: Session,
    project_uuid: uuid.UUID,
    source: Literal["search", "chat"],
    *,
    skip_cache: bool = False,
) -> Dict[str, Any]:
    last_key: _LastKey = (str(project_uuid), source)
    flight_key: _FlightKey = (*last_key, skip_cache)
    session_factory = sessionmaker(bind=db.get_bind())
    with _lock:
        last = _last.get(last_key)
        future = _inflight.get(flight_key)
        if future is None:
            future = _executor.submit(_compute, session_factory, project_uuid, source, skip_cache, flight_key)
            _inflight[flight_key] = future
    try:
        return future.result(timeout=REFRESH_WAIT_SECONDS if last else FIRST_PASS_WAIT_SECONDS)
    except FuturesTimeout:
        if last is not None:
            logger.warning(
                "embedding-item-coverage: pass still running for project %s (%s); returning last known result",
                last_key[0], source,
            )
            return last
        raise CoveragePending("Embedding coverage is still being checked")
    except Exception:
        if last is None:
            raise
        logger.exception(
            "embedding-item-coverage: pass failed for project %s (%s); returning last known result",
            last_key[0], source,
        )
        return last


def clear() -> None:
    """Forget last known results (passes already running still finish)."""
    with _lock:
        _last.clear()


def _compute(
    session_factory: sessionmaker,
    project_uuid: uuid.UUID,
    source: Literal["search", "chat"],
    skip_cache: bool,
    flight_key: _FlightKey,
) -> Dict[str, Any]:
    from .reindex_service import get_item_embedding_coverage

    db = session_factory()
    try:
        payload = get_item_embedding_coverage(db, project_uuid, source=source, skip_cache=skip_cache)
        last_key: _LastKey = (flight_key[0], flight_key[1])
        with _lock:
            if last_key not in _last and len(_last) >= _MAX_ENTRIES:
                del _last[next(iter(_last))]
            _last[last_key] = payload
        return payload
    finally:
        db.close()
        with _lock:
            _inflight.pop(flight_key, None)
