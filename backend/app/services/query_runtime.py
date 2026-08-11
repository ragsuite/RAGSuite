"""
Dedicated thread pool for RAG chat/search/compare so retrieval does not compete with
the default asyncio executor used by crawls and other blocking work.
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
            workers = max(2, int(getattr(settings, "query_pool_workers", 8)))
            _pool = ThreadPoolExecutor(
                max_workers=workers,
                thread_name_prefix="rag-query",
            )
            logger.info("RAG query thread pool started with %s worker(s)", workers)
    return _pool


def query_pool_stats() -> dict:
    pool = _pool
    if pool is None:
        return {"max_workers": 0, "active": False}
    return {"max_workers": pool._max_workers, "active": True}


async def run_query_async(func: Callable[..., Any], /, *args, **kwargs) -> Any:
    loop = asyncio.get_running_loop()
    bound = functools.partial(func, *args, **kwargs)
    return await loop.run_in_executor(_get_pool(), bound)


def run_query_sync(func: Callable[..., Any], /, *args, **kwargs) -> Any:
    return _get_pool().submit(func, *args, **kwargs).result()
