"""Cache-key parts shared by the answer cache and the retrieval cache.

A key must change whenever anything that shapes the result changes: the knowledge base
(generation), the processed question, the catalog rows put in the prompt and the
retrieval settings. ``None`` means "do not cache" (no shared generation available).
"""
from __future__ import annotations

import copy
import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, List, Optional

from . import kb_generation

RETRIEVAL_CACHE_MAX = 256
RETRIEVAL_CACHE_TTL = float(os.getenv("RAG_RETRIEVAL_CACHE_TTL", "300"))


def _digest(value: Any) -> str:
    text = value if isinstance(value, str) else json.dumps(value, sort_keys=True, default=repr)
    return hashlib.sha256(text.encode("utf-8", "surrogatepass")).hexdigest()[:24]


def item_fingerprint(item_context: Any) -> str:
    if item_context is None:
        return "-"
    try:
        return _digest(item_context.prompt_block([]))
    except Exception:
        return _digest(repr(item_context))


def variant(
    processed_query: Any,
    item_context: Any,
    settings: Dict[str, Any],
    chat_history: Optional[List[Any]] = None,
) -> Optional[str]:
    """Suffix for the answer-cache key, or None when caching must be skipped.

    Only first turns are cached: a follow-up answer depends on the whole conversation.
    """
    if chat_history:
        return None
    generation = kb_generation.current()
    if generation is None:
        return None
    pq = repr(processed_query) if processed_query is not None else "-"
    return f"|kb:{generation}|pq:{_digest(pq)}|items:{item_fingerprint(item_context)}|cfg:{_digest(settings)}"


class RetrievalCache:
    """Small in-process TTL + LRU cache of retrieval results (deep-copied in and out)."""

    def __init__(self, max_entries: int = RETRIEVAL_CACHE_MAX, ttl: float = RETRIEVAL_CACHE_TTL) -> None:
        self._entries: "OrderedDict[str, tuple]" = OrderedDict()
        self._lock = threading.Lock()
        self._max = max_entries
        self._ttl = ttl

    def key(self, parts: Dict[str, Any]) -> Optional[str]:
        generation = kb_generation.current()
        if generation is None or self._ttl <= 0:
            return None
        return f"{generation}:{_digest(parts)}"

    def get(self, key: Optional[str]) -> Any:
        if key is None:
            return None
        with self._lock:
            hit = self._entries.get(key)
            if hit is None:
                return None
            stamp, value = hit
            if time.monotonic() - stamp > self._ttl:
                self._entries.pop(key, None)
                return None
            self._entries.move_to_end(key)
        return copy.deepcopy(value)

    def put(self, key: Optional[str], value: Any) -> None:
        if key is None:
            return
        stored = copy.deepcopy(value)
        with self._lock:
            self._entries[key] = (time.monotonic(), stored)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max:
                self._entries.popitem(last=False)


retrieval_cache = RetrievalCache()
