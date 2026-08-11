"""
Dedicated thread pool for vector ingest so crawl/upload/reindex work does not block
the asyncio event loop or the default executor used by chat retrieval.
"""
from __future__ import annotations

import asyncio
import functools
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, Optional

from ..settings import settings

logger = logging.getLogger(__name__)

_pool: Optional[ThreadPoolExecutor] = None
_pool_lock = threading.Lock()


def _get_pool() -> ThreadPoolExecutor:
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is None:
            workers = max(1, int(settings.ingest_pool_workers))
            _pool = ThreadPoolExecutor(
                max_workers=workers,
                thread_name_prefix="ingest",
            )
            logger.info("Ingest thread pool started with %s worker(s)", workers)
    return _pool


def ingest_pool_stats() -> dict:
    pool = _pool
    if pool is None:
        return {"max_workers": 0, "active": False}
    return {"max_workers": pool._max_workers, "active": True}


def run_ingest_sync(func: Callable[..., Any], /, *args, **kwargs) -> Any:
    """Run a blocking ingest callable (used from reindex/scheduler threads)."""
    if not settings.enable_async_ingest:
        return func(*args, **kwargs)
    return _get_pool().submit(func, *args, **kwargs).result()


async def run_ingest_async(func: Callable[..., Any], /, *args, **kwargs) -> Any:
    """Run a blocking ingest callable without blocking the event loop."""
    if not settings.enable_async_ingest:
        return func(*args, **kwargs)
    loop = asyncio.get_running_loop()
    bound = functools.partial(func, *args, **kwargs)
    return await loop.run_in_executor(_get_pool(), bound)
