"""Write coordination for the vector store across API and worker replicas.

Queries take no lock. Writes to one collection are serialized (Redis when
configured, otherwise a process-local lock). Active writes are counted so
shutdown can drain them, and every write advances the knowledge-base generation.
"""
from __future__ import annotations

import logging
import threading
import time
from contextlib import contextmanager
from typing import Dict, Iterator, Optional, Tuple

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


def _acquire_lock(collection_name: Optional[str], wait_start: float) -> Tuple[str, object, Optional[str]]:
    from ..redis_client import get_redis

    client = get_redis()
    key = f"ragsuite:vwrite:{collection_name or _GLOBAL_KEY}"
    token = f"{time.time()}:{id(threading.current_thread())}"
    if client is None:
        lock = _lock_for(collection_name)
        lock.acquire()
        return ("thread", lock, None)
    deadline = wait_start + 300.0
    while time.time() < deadline:
        try:
            if client.set(key, token, nx=True, ex=300):
                return ("redis", key, token)
        except Exception as exc:
            logger.warning("Redis vector write lock failed (%s) — using process lock", exc)
            lock = _lock_for(collection_name)
            lock.acquire()
            return ("thread", lock, None)
        time.sleep(0.05)
    raise TimeoutError(f"vector write lock timed out for {collection_name}")


@contextmanager
def vector_write_lock(collection_name: Optional[str] = None) -> Iterator[None]:
    """Serialize writes to ``collection_name`` across API/worker replicas."""
    timer = VectorWriteLockTimer()
    wait_start = time.time()
    _track(1)
    kind = token = handle = None
    try:
        kind, handle, token = _acquire_lock(collection_name, wait_start)
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
            if kind == "thread":
                handle.release()
            elif kind == "redis":
                try:
                    from ..redis_client import get_redis

                    client = get_redis()
                    if client is not None and client.get(handle) == token:
                        client.delete(handle)
                except Exception:
                    pass
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
