"""In-process write coordination for the pgvector store.

Postgres MVCC isolates readers from writers, so queries take no lock. Writes to one
collection are serialized per process (one ingest stream per collection keeps HNSW
insert contention and WAL bursts low); different collections write in parallel.
Active writes are counted so shutdown can drain them, and every write advances the
knowledge-base generation.
"""
from __future__ import annotations

import logging
import threading
import time
from contextlib import contextmanager
from typing import Dict, Iterator, Optional

from ..observability import VectorWriteLockTimer, record_vector_lock_wait
from . import kb_generation

logger = logging.getLogger(__name__)

_GLOBAL_KEY = "*"
_locks: Dict[str, threading.Lock] = {}
_locks_meta = threading.Lock()
_active = 0
_active_cond = threading.Condition(threading.Lock())


def _lock_for(collection_name: Optional[str]) -> threading.Lock:
    key = collection_name or _GLOBAL_KEY
    with _locks_meta:
        lock = _locks.get(key)
        if lock is None:
            lock = _locks[key] = threading.Lock()
        return lock


def _track(delta: int) -> None:
    global _active
    with _active_cond:
        _active += delta
        if _active == 0:
            _active_cond.notify_all()


@contextmanager
def vector_write_lock(collection_name: Optional[str] = None) -> Iterator[None]:
    """Serialize writes to ``collection_name`` (``None``: cross-collection maintenance)."""
    timer = VectorWriteLockTimer()
    wait_start = time.time()
    lock = _lock_for(collection_name)
    _track(1)
    try:
        lock.acquire()
        try:
            wait_time = time.time() - wait_start
            if wait_time > 0:
                record_vector_lock_wait(wait_time)
            if wait_time > 1.0:
                logger.warning(
                    "vector write lock waited %.1fs (collection=%s) — another write was running",
                    wait_time, collection_name or "global",
                )
            timer.mark_acquired()
            yield
        finally:
            timer.mark_released()
            lock.release()
            kb_generation.bump()
    finally:
        _track(-1)


def wait_for_ingest_drain(timeout: float = 30.0) -> bool:
    """Block until no vector write is active or ``timeout`` expires. True when drained."""
    deadline = time.time() + max(0.0, timeout)
    with _active_cond:
        while _active > 0:
            remaining = deadline - time.time()
            if remaining <= 0:
                return False
            _active_cond.wait(timeout=remaining)
    return True
