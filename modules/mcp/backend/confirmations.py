"""One-time confirmation tokens for destructive and sensitive MCP actions.

A token is bound to the API key, user, tool, and a hash of the arguments.
It is single-use and expires after 10 minutes. Redis is used when available.
"""
from __future__ import annotations

import hashlib
import json
import secrets
import threading
import time
from typing import Any, Optional

TTL_SECONDS = 600
_PREFIX = "mcp:confirm:"
_lock = threading.Lock()
_memory: dict[str, tuple[float, str]] = {}


def args_fingerprint(tool: str, arguments: dict[str, Any]) -> str:
    cleaned = {
        key: arguments[key]
        for key in sorted(arguments)
        if key not in {"confirmation_token", "confirm", "idempotency_key"} and arguments[key] is not None
    }
    raw = json.dumps({"tool": tool, "args": cleaned}, default=str, sort_keys=True)
    return hashlib.sha256(raw.encode()).hexdigest()


def _payload(api_key_id: Any, user_id: Any, tool: str, fingerprint: str) -> str:
    return json.dumps(
        {
            "api_key_id": str(api_key_id),
            "user_id": str(user_id),
            "tool": tool,
            "fingerprint": fingerprint,
        }
    )


def _redis():
    try:
        from app.services.redis_client import get_redis

        return get_redis()
    except Exception:
        return None


def issue_token(*, api_key_id: Any, user_id: Any, tool: str, arguments: dict[str, Any]) -> tuple[str, int]:
    token = secrets.token_urlsafe(24)
    body = _payload(api_key_id, user_id, tool, args_fingerprint(tool, arguments))
    client = _redis()
    if client is not None:
        try:
            client.setex(_PREFIX + token, TTL_SECONDS, body)
            return token, TTL_SECONDS
        except Exception:
            pass
    with _lock:
        _memory[token] = (time.time() + TTL_SECONDS, body)
    return token, TTL_SECONDS


def consume_token(
    token: str,
    *,
    api_key_id: Any,
    user_id: Any,
    tool: str,
    arguments: dict[str, Any],
) -> None:
    """Raise ValueError with a short code when the token cannot be used."""
    if not token or not str(token).strip():
        raise ValueError("missing")
    raw = _take(str(token).strip())
    if raw is None:
        raise ValueError("invalid")
    try:
        stored = json.loads(raw)
    except Exception as exc:
        raise ValueError("invalid") from exc
    expected = args_fingerprint(tool, arguments)
    if stored.get("tool") != tool:
        raise ValueError("wrong_action")
    if stored.get("api_key_id") != str(api_key_id) or stored.get("user_id") != str(user_id):
        raise ValueError("wrong_actor")
    if stored.get("fingerprint") != expected:
        raise ValueError("args_changed")


def cancel_token(token: str, *, api_key_id: Any, user_id: Any) -> bool:
    if not token:
        return False
    raw = _peek(str(token).strip())
    if raw is None:
        return False
    try:
        stored = json.loads(raw)
    except Exception:
        return False
    if stored.get("api_key_id") != str(api_key_id) or stored.get("user_id") != str(user_id):
        return False
    _take(str(token).strip())
    return True


def _peek(token: str) -> Optional[str]:
    client = _redis()
    if client is not None:
        try:
            value = client.get(_PREFIX + token)
            if value is not None:
                return value.decode() if isinstance(value, bytes) else str(value)
        except Exception:
            pass
    with _lock:
        row = _memory.get(token)
        if not row:
            return None
        expires, body = row
        if expires < time.time():
            _memory.pop(token, None)
            return None
        return body


def _take(token: str) -> Optional[str]:
    client = _redis()
    if client is not None:
        try:
            key = _PREFIX + token
            value = client.get(key)
            if value is not None:
                client.delete(key)
                return value.decode() if isinstance(value, bytes) else str(value)
        except Exception:
            pass
    with _lock:
        row = _memory.pop(token, None)
        if not row:
            return None
        expires, body = row
        if expires < time.time():
            return None
        return body
