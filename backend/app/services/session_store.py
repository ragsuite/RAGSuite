"""
Redis-backed chat session store with in-memory fallback.

Key format:  chat_session:{scope}:{session_id}
Scope:       u:{user_id}       — authenticated user sessions
             w:{project_id}    — widget (embedded chatbot) sessions
             k:{api_key_id}    — API key sessions

Widget scope w:{project_id} isolates across projects. Within the same widget,
session_ids are backend-generated UUIDs (122-bit entropy) validated against the
ChatMessage DB table — practically unguessable. If stronger per-visitor isolation
is required, add a session_secret field to the response/request (minor API change).

Thread-safe. Degrades gracefully when Redis is unavailable (in-memory fallback).
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)

# Lua script: atomically GET list, apply Python operation via JSON, then SETEX.
# Called from Python with KEYS[1]=key, ARGV[1]=new_json, ARGV[2]=ttl_seconds.
_LUA_SET = """
local ttl = tonumber(ARGV[2])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ttl)
return 1
"""

# Lua script: atomically append one message to the session list.
# KEYS[1]=session key, ARGV[1]=message JSON, ARGV[2]=ttl seconds.
_LUA_APPEND = """
local existing = redis.call('GET', KEYS[1])
local msgs
if existing and existing ~= '' then
    msgs = cjson.decode(existing)
else
    msgs = {}
end
local new_msg = cjson.decode(ARGV[1])
table.insert(msgs, new_msg)
local ttl = tonumber(ARGV[2])
redis.call('SET', KEYS[1], cjson.encode(msgs), 'EX', ttl)
return #msgs
"""

_NO_REDIS_WARNED = False


class SessionStore:
    """
    Public API mirrors the old chat_sessions dict semantics so callers can
    do a mechanical substitution. All methods are thread-safe.
    """

    def __init__(self, redis_client: Optional[Any], ttl_seconds: int) -> None:
        self._redis = redis_client
        self._ttl = int(ttl_seconds)
        self._mem: Dict[str, List[Dict]] = {}
        self._lock = threading.Lock()
        self._store_type = "redis" if redis_client is not None else "memory"
        logger.info(
            "SessionStore initialized: mode=%s ttl=%ds", self._store_type, self._ttl
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _key(self, session_id: str, scope: str) -> str:
        return f"chat_session:{scope}:{session_id}"

    def _mem_key(self, session_id: str, scope: str) -> str:
        # Flat dict key for in-memory fallback.
        return f"{scope}:{session_id}"

    def _redis_get(self, key: str) -> Optional[List[Dict]]:
        try:
            raw = self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("SessionStore Redis GET error: %s", exc)
        return None

    def _redis_set(self, key: str, messages: List[Dict]) -> bool:
        """Returns True on success, False on failure. Does NOT fall back to memory."""
        try:
            self._redis.set(key, json.dumps(messages), ex=self._ttl)
            return True
        except Exception as exc:
            logger.error("SessionStore Redis SET failed: %s — session state not written", exc)
            return False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get(self, session_id: str, scope: str) -> Optional[List[Dict]]:
        """Return session message list, or None if session does not exist."""
        if self._redis is not None:
            val = self._redis_get(self._key(session_id, scope))
            return val  # None if not found
        with self._lock:
            stored = self._mem.get(self._mem_key(session_id, scope))
            return list(stored) if stored is not None else None

    def contains(self, session_id: str, scope: str) -> bool:
        """True if session exists (even if empty)."""
        if self._redis is not None:
            try:
                return bool(self._redis.exists(self._key(session_id, scope)))
            except Exception as exc:
                logger.warning("SessionStore Redis EXISTS error: %s", exc)
                return False
        with self._lock:
            return self._mem_key(session_id, scope) in self._mem

    def init_if_missing(self, session_id: str, scope: str) -> None:
        """Create empty session list if session does not already exist."""
        if self._redis is not None:
            key = self._key(session_id, scope)
            try:
                # SETNX: only creates if absent — preserves existing sessions.
                self._redis.set(key, "[]", ex=self._ttl, nx=True)
            except Exception as exc:
                # Redis write failure when configured: log and return.
                # Do NOT fall back to in-memory — would split state with Redis reads.
                logger.error("SessionStore Redis SETNX failed: %s — new session may not persist", exc)
            return
        mem_key = self._mem_key(session_id, scope)
        with self._lock:
            if mem_key not in self._mem:
                self._mem[mem_key] = []

    def append(self, session_id: str, scope: str, message: Dict) -> None:
        """
        Append a message to the session, resetting TTL.
        When Redis is configured and fails: logs the error and returns WITHOUT writing
        to in-memory. This keeps the session state consistent in Redis (no split-brain).
        The in-flight message is lost for context, but prior history is not scrambled.
        """
        if self._redis is not None:
            key = self._key(session_id, scope)
            try:
                self._redis.eval(
                    _LUA_APPEND, 1, key, json.dumps(message), str(self._ttl)
                )
            except Exception as exc:
                logger.error(
                    "SessionStore Redis APPEND failed: %s — message not stored "
                    "(session stays consistent in Redis; no in-memory fallback to prevent state split)",
                    exc,
                )
            return  # Always return — never fall through to in-memory when Redis is configured
        mem_key = self._mem_key(session_id, scope)
        with self._lock:
            if mem_key not in self._mem:
                self._mem[mem_key] = []
            self._mem[mem_key].append(message)

    def set_session(self, session_id: str, scope: str, messages: List[Dict]) -> None:
        """Replace entire session message list (used for hydration / bulk update)."""
        if self._redis is not None:
            self._redis_set(self._key(session_id, scope), messages)
            return  # No in-memory fallback — same state-split protection as append
        mem_key = self._mem_key(session_id, scope)
        with self._lock:
            self._mem[mem_key] = list(messages)

    def delete(self, session_id: str, scope: str) -> None:
        """Remove a session entirely."""
        if self._redis is not None:
            try:
                self._redis.delete(self._key(session_id, scope))
            except Exception as exc:
                logger.warning("SessionStore Redis DELETE error: %s", exc)
            return
        with self._lock:
            self._mem.pop(self._mem_key(session_id, scope), None)

    def filter_messages(
        self, session_id: str, scope: str, predicate: Callable[[Dict], bool]
    ) -> None:
        """
        Keep only messages where predicate returns True.
        Redis path: read → filter → write (two round-trips, not atomic).
        Under extreme load a concurrent append could be dropped; acceptable for
        the low-frequency delete use case.
        """
        if self._redis is not None:
            key = self._key(session_id, scope)
            raw = self._redis_get(key)
            if raw is not None:
                filtered = [m for m in raw if predicate(m)]
                self._redis_set(key, filtered)
            return  # No in-memory fallback
        mem_key = self._mem_key(session_id, scope)
        with self._lock:
            stored = self._mem.get(mem_key)
            if stored is not None:
                self._mem[mem_key] = [m for m in stored if predicate(m)]

    def store_type(self) -> str:
        """'redis' or 'memory'"""
        return self._store_type

    def active_count(self) -> int:
        """
        Count of live chat sessions (keys matching chat_session:*).
        Uses SCAN with COUNT hint — O(N) but accurate. Returns -1 on error.
        """
        if self._redis is not None:
            try:
                count = sum(1 for _ in self._redis.scan_iter("chat_session:*", count=100))
                return count
            except Exception:
                return -1
        with self._lock:
            return len(self._mem)


# ------------------------------------------------------------------
# Module-level singleton
# ------------------------------------------------------------------

_store: Optional[SessionStore] = None


def init_session_store() -> SessionStore:
    """
    Initialize the singleton. Must be called once from main.py lifespan
    AFTER redis_client.get_redis() has been called.
    """
    global _store
    from .redis_client import get_redis
    from ..settings import settings

    _store = SessionStore(
        redis_client=get_redis(),
        ttl_seconds=settings.chat_session_ttl_seconds,
    )
    return _store


def get_session_store() -> SessionStore:
    """
    Return the initialized store.
    If init_session_store() was never called (startup failure), returns an
    emergency in-memory store so chat endpoints don't crash.
    """
    global _store
    if _store is None:
        logger.warning(
            "SessionStore not initialized — using emergency in-memory fallback. "
            "Call init_session_store() in app lifespan to persist sessions."
        )
        _store = SessionStore(redis_client=None, ttl_seconds=7200)
    return _store
