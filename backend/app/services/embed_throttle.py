"""Serialize hosted embedding HTTP calls to respect vendor rate limits."""
from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Iterator

_semaphore: threading.Semaphore | None = None
_init_lock = threading.Lock()


def _hosted_embed_model_types():
    types: list[type] = []
    try:
        from llama_index.embeddings.mistralai import MistralAIEmbedding

        types.append(MistralAIEmbedding)
    except ImportError:
        pass
    try:
        from llama_index.embeddings.openai import OpenAIEmbedding

        types.append(OpenAIEmbedding)
    except ImportError:
        pass
    try:
        from llama_index.embeddings.gemini import GeminiEmbedding

        types.append(GeminiEmbedding)
    except ImportError:
        pass
    return tuple(types)


def is_hosted_embed_model(embed_model) -> bool:
    if embed_model is None:
        return False
    return isinstance(embed_model, _hosted_embed_model_types())


def _get_semaphore() -> threading.Semaphore:
    global _semaphore
    with _init_lock:
        if _semaphore is None:
            from ..settings import settings

            slots = max(1, int(getattr(settings, "embed_hosted_api_max_concurrency", 1) or 1))
            _semaphore = threading.Semaphore(slots)
        return _semaphore


@contextmanager
def hosted_embed_slot(embed_model) -> Iterator[None]:
    """Hold a slot while calling a remote embedding API (Mistral/OpenAI/Gemini)."""
    if not is_hosted_embed_model(embed_model):
        yield
        return
    sem = _get_semaphore()
    sem.acquire()
    try:
        yield
    finally:
        sem.release()


def reset_embed_throttle_for_tests() -> None:
    global _semaphore
    with _init_lock:
        _semaphore = None
