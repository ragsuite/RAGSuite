"""
Shared Redis client singleton for session store and scheduler leader lock.

Graceful: returns None when Redis is unavailable. Callers must handle None.
Existing RAGPipeline keeps its own internal client — do not consolidate it here.
"""
from __future__ import annotations

import logging
import threading
from typing import Optional

import redis

from .infra_env import redis_url_or_none

logger = logging.getLogger(__name__)

_client: Optional[redis.Redis] = None
_lock = threading.Lock()


def _build_url() -> Optional[str]:
    """Resolve connection URL: settings.redis_url > REDIS_HOST/PORT > None."""
    return redis_url_or_none(db=1)


def get_redis() -> Optional[redis.Redis]:
    """
    Return shared Redis client, or None if Redis is not configured / unavailable.
    Thread-safe double-checked locking singleton.
    """
    global _client
    if _client is not None:
        return _client
    with _lock:
        if _client is not None:
            return _client
        url = _build_url()
        if not url:
            logger.info("Redis not configured (no REDIS_HOST / REDIS_URL) — running without Redis")
            return None
        try:
            c = redis.from_url(
                url,
                decode_responses=True,
                socket_timeout=2,
                socket_connect_timeout=2,
            )
            c.ping()
            _client = c
            display = url.split("@")[-1] if "@" in url else url
            logger.info("Shared Redis client connected: %s (db=1)", display)
        except Exception as exc:
            logger.warning(
                "Redis unavailable (%s) — session store and scheduler lock will use in-memory fallback",
                exc,
            )
        return _client


def is_redis_available() -> bool:
    """Non-blocking health probe — safe to call frequently."""
    c = get_redis()
    if c is None:
        return False
    try:
        c.ping()
        return True
    except Exception:
        return False
