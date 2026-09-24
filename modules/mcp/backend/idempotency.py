"""Store MCP create/action results for 24 hours so a retry does not run twice."""
from __future__ import annotations

import json
import threading
import time
from typing import Any, Optional

TTL_SECONDS = 24 * 3600
_PREFIX = "mcp:idem:"
_lock = threading.Lock()
_memory: dict[str, tuple[float, str]] = {}


def _redis():
    try:
        from app.services.redis_client import get_redis

        return get_redis()
    except Exception:
        return None


def _key(api_key_id: Any, tool: str, idempotency_key: str) -> str:
    return f"{_PREFIX}{api_key_id}:{tool}:{idempotency_key}"


def get_cached(api_key_id: Any, tool: str, idempotency_key: Optional[str]) -> Optional[str]:
    if not idempotency_key:
        return None
    key = _key(api_key_id, tool, idempotency_key)
    client = _redis()
    if client is not None:
        try:
            value = client.get(key)
            if value is not None:
                return value.decode() if isinstance(value, bytes) else str(value)
        except Exception:
            pass
    with _lock:
        row = _memory.get(key)
        if not row:
            return None
        expires, body = row
        if expires < time.time():
            _memory.pop(key, None)
            return None
        return body


def store(api_key_id: Any, tool: str, idempotency_key: Optional[str], body: str) -> None:
    if not idempotency_key:
        return
    key = _key(api_key_id, tool, idempotency_key)
    client = _redis()
    if client is not None:
        try:
            client.setex(key, TTL_SECONDS, body)
            return
        except Exception:
            pass
    with _lock:
        _memory[key] = (time.time() + TTL_SECONDS, body)
