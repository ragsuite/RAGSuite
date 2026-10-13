"""Query embeddings: small TTL + LRU cache (same model and text -> same vector), brief retry when throttled."""
from __future__ import annotations

import os
import threading
import time
from collections import OrderedDict
from typing import Any, Callable, List, Optional, Tuple

MAX_ENTRIES = 512
TTL_SECONDS = 600.0
RATE_LIMIT_RETRY_DELAYS = (0.5, 1.5)

_entries: "OrderedDict[Tuple[str, str, str], Tuple[float, List[float]]]" = OrderedDict()
_lock = threading.Lock()


def _enabled() -> bool:
    return os.getenv("RAG_QUERY_EMBED_CACHE", "true").strip().lower() not in {"0", "false", "no", "off"}


def model_identity(embed_model: Any) -> Tuple[str, str]:
    name = getattr(embed_model, "model_name", None) or getattr(embed_model, "model", None) or ""
    return type(embed_model).__name__, str(name)


def get(embed_model: Any, text: str) -> Optional[List[float]]:
    key = (*model_identity(embed_model), text)
    now = time.monotonic()
    with _lock:
        hit = _entries.get(key)
        if hit is None:
            return None
        stamp, vector = hit
        if now - stamp > TTL_SECONDS:
            _entries.pop(key, None)
            return None
        _entries.move_to_end(key)
        return vector


def put(embed_model: Any, text: str, vector: List[float]) -> None:
    key = (*model_identity(embed_model), text)
    with _lock:
        _entries[key] = (time.monotonic(), vector)
        _entries.move_to_end(key)
        while len(_entries) > MAX_ENTRIES:
            _entries.popitem(last=False)


def _embed_with_retry(embed: Callable[[str], List[float]], text: str) -> List[float]:
    """A query embedding shares the provider quota with ingest; retry briefly when throttled."""
    from ..embed_rate_limit import is_embed_rate_limit_error

    for delay in RATE_LIMIT_RETRY_DELAYS:
        try:
            return embed(text)
        except Exception as exc:
            if not is_embed_rate_limit_error(exc):
                raise
            time.sleep(delay)
    return embed(text)


def embed_query(embed_model: Any, text: str, embed: Callable[[str], List[float]]) -> List[float]:
    if not _enabled():
        return _embed_with_retry(embed, text)
    cached = get(embed_model, text)
    if cached is not None:
        return cached
    vector = _embed_with_retry(embed, text)
    if vector:
        put(embed_model, text, vector)
    return vector


def clear() -> None:
    with _lock:
        _entries.clear()
