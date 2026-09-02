"""
Redis-backed chat/search session store with in-memory fallback.

Key format:  {namespace}_session:{scope}:{session_id}
  namespace: chat | search
Scope:       u:{user_id}       — authenticated user sessions
             w:{project_id}    — widget (embedded) sessions
             k:{api_key_id}    — API key sessions

Thread-safe. Degrades gracefully when Redis is unavailable (in-memory fallback).
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any, Callable, Dict, List, Literal, Optional

logger = logging.getLogger(__name__)

SessionNamespace = Literal["chat", "search"]

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


class SessionStore:
    """Public API mirrors the old chat_sessions dict semantics."""

    def __init__(self, redis_client: Optional[Any], ttl_seconds: int) -> None:
        self._redis = redis_client
        self._ttl = int(ttl_seconds)
        self._mem: Dict[str, List[Dict]] = {}
        self._lock = threading.Lock()
        self._store_type = "redis" if redis_client is not None else "memory"
        logger.info(
            "SessionStore initialized: mode=%s ttl=%ds", self._store_type, self._ttl
        )

    def _key(self, session_id: str, scope: str, namespace: SessionNamespace = "chat") -> str:
        return f"{namespace}_session:{scope}:{session_id}"

    def _mem_key(self, session_id: str, scope: str, namespace: SessionNamespace = "chat") -> str:
        return f"{namespace}:{scope}:{session_id}"

    def _resolve_ttl(self, ttl_seconds: Optional[int]) -> int:
        return int(ttl_seconds) if ttl_seconds is not None else self._ttl

    def _redis_get(self, key: str) -> Optional[List[Dict]]:
        try:
            raw = self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as exc:
            logger.warning("SessionStore Redis GET error: %s", exc)
        return None

    def _redis_set(
        self,
        key: str,
        messages: List[Dict],
        ttl_seconds: Optional[int] = None,
    ) -> bool:
        ttl = self._resolve_ttl(ttl_seconds)
        try:
            self._redis.set(key, json.dumps(messages), ex=ttl)
            return True
        except Exception as exc:
            logger.error("SessionStore Redis SET failed: %s — session state not written", exc)
            return False

    def get(
        self,
        session_id: str,
        scope: str,
        namespace: SessionNamespace = "chat",
    ) -> Optional[List[Dict]]:
        if self._redis is not None:
            return self._redis_get(self._key(session_id, scope, namespace))
        with self._lock:
            stored = self._mem.get(self._mem_key(session_id, scope, namespace))
            return list(stored) if stored is not None else None

    def contains(
        self,
        session_id: str,
        scope: str,
        namespace: SessionNamespace = "chat",
    ) -> bool:
        if self._redis is not None:
            try:
                return bool(self._redis.exists(self._key(session_id, scope, namespace)))
            except Exception as exc:
                logger.warning("SessionStore Redis EXISTS error: %s", exc)
                return False
        with self._lock:
            return self._mem_key(session_id, scope, namespace) in self._mem

    def init_if_missing(
        self,
        session_id: str,
        scope: str,
        namespace: SessionNamespace = "chat",
        ttl_seconds: Optional[int] = None,
    ) -> None:
        ttl = self._resolve_ttl(ttl_seconds)
        if self._redis is not None:
            key = self._key(session_id, scope, namespace)
            try:
                self._redis.set(key, "[]", ex=ttl, nx=True)
            except Exception as exc:
                logger.error("SessionStore Redis SETNX failed: %s — new session may not persist", exc)
            return
        mem_key = self._mem_key(session_id, scope, namespace)
        with self._lock:
            if mem_key not in self._mem:
                self._mem[mem_key] = []

    def append(
        self,
        session_id: str,
        scope: str,
        message: Dict,
        namespace: SessionNamespace = "chat",
        ttl_seconds: Optional[int] = None,
    ) -> None:
        ttl = self._resolve_ttl(ttl_seconds)
        if self._redis is not None:
            key = self._key(session_id, scope, namespace)
            try:
                self._redis.eval(_LUA_APPEND, 1, key, json.dumps(message), str(ttl))
            except Exception as exc:
                logger.error(
                    "SessionStore Redis APPEND failed: %s — message not stored",
                    exc,
                )
            return
        mem_key = self._mem_key(session_id, scope, namespace)
        with self._lock:
            if mem_key not in self._mem:
                self._mem[mem_key] = []
            self._mem[mem_key].append(message)

    def set_session(
        self,
        session_id: str,
        scope: str,
        messages: List[Dict],
        namespace: SessionNamespace = "chat",
        ttl_seconds: Optional[int] = None,
    ) -> None:
        if self._redis is not None:
            self._redis_set(
                self._key(session_id, scope, namespace),
                messages,
                ttl_seconds=ttl_seconds,
            )
            return
        mem_key = self._mem_key(session_id, scope, namespace)
        with self._lock:
            self._mem[mem_key] = list(messages)

    def delete(
        self,
        session_id: str,
        scope: str,
        namespace: SessionNamespace = "chat",
    ) -> None:
        if self._redis is not None:
            try:
                self._redis.delete(self._key(session_id, scope, namespace))
            except Exception as exc:
                logger.warning("SessionStore Redis DELETE error: %s", exc)
            return
        with self._lock:
            self._mem.pop(self._mem_key(session_id, scope, namespace), None)

    def filter_messages(
        self,
        session_id: str,
        scope: str,
        predicate: Callable[[Dict], bool],
        namespace: SessionNamespace = "chat",
        ttl_seconds: Optional[int] = None,
    ) -> None:
        if self._redis is not None:
            key = self._key(session_id, scope, namespace)
            raw = self._redis_get(key)
            if raw is not None:
                filtered = [m for m in raw if predicate(m)]
                self._redis_set(key, filtered, ttl_seconds=ttl_seconds)
            return
        mem_key = self._mem_key(session_id, scope, namespace)
        with self._lock:
            stored = self._mem.get(mem_key)
            if stored is not None:
                self._mem[mem_key] = [m for m in stored if predicate(m)]

    def store_type(self) -> str:
        return self._store_type

    def active_count(self) -> int:
        if self._redis is not None:
            try:
                count = 0
                for pattern in ("chat_session:*", "search_session:*"):
                    count += sum(1 for _ in self._redis.scan_iter(pattern, count=100))
                return count
            except Exception:
                return -1
        with self._lock:
            return len(self._mem)


_store: Optional[SessionStore] = None


def init_session_store() -> SessionStore:
    global _store
    from .redis_client import get_redis
    from ..settings import settings

    _store = SessionStore(
        redis_client=get_redis(),
        ttl_seconds=settings.chat_session_ttl_seconds,
    )
    return _store


def get_session_store() -> SessionStore:
    global _store
    if _store is None:
        logger.warning(
            "SessionStore not initialized — using emergency in-memory fallback."
        )
        _store = SessionStore(redis_client=None, ttl_seconds=1800)
    return _store


def append_search_turn(
    session_id: str,
    scope: str,
    query: str,
    answer: str,
    ttl_seconds: int,
) -> None:
    """Persist a search Q&A pair in ephemeral search session storage."""
    store = get_session_store()
    store.append(
        session_id,
        scope,
        {"type": "user", "content": query.strip()},
        namespace="search",
        ttl_seconds=ttl_seconds,
    )
    if answer and answer.strip():
        store.append(
            session_id,
            scope,
            {"type": "assistant", "content": answer.strip()},
            namespace="search",
            ttl_seconds=ttl_seconds,
        )


def load_search_turns(
    session_id: str,
    scope: str,
    max_messages: int = 4,
) -> List[Dict[str, str]]:
    """Return recent search turns as prompt-format dicts."""
    store = get_session_store()
    msgs = store.get(session_id, scope, namespace="search") or []
    turns: List[Dict[str, str]] = []
    for msg in msgs[-max_messages:]:
        content = (msg.get("content") or "").strip()
        msg_type = msg.get("type")
        if content and msg_type in ("user", "assistant"):
            turns.append({"type": msg_type, "content": content})
    return turns
