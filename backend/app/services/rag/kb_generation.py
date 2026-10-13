"""Knowledge-base generation: a shared counter bumped on every index write.

Cached answers and retrieval results carry the generation they were built under, so any
ingest, delete, re-embed or catalog refresh (in the API or the worker process)
invalidates them at once. Without Redis there is no shared counter and ``current()``
returns None: callers then skip caching rather than risk stale answers.
"""
from __future__ import annotations

import logging
from typing import Optional

from ..redis_client import get_redis

logger = logging.getLogger(__name__)

KEY = "ragsuite:kb_generation"


def current() -> Optional[str]:
    client = get_redis()
    if client is None:
        return None
    try:
        return str(client.get(KEY) or "0")
    except Exception as exc:
        logger.debug("kb_generation read failed: %s", exc)
        return None


def bump() -> None:
    client = get_redis()
    if client is None:
        return
    try:
        client.incr(KEY)
    except Exception as exc:
        logger.warning("kb_generation bump failed (caches may serve stale results): %s", exc)
