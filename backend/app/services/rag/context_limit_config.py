"""How many retrieved chunks are passed to the chat LLM (follows saved top_k)."""

import os

RAG_MAX_CONTEXTS_ENV = "RAG_MAX_CONTEXTS"
DEFAULT_TOP_K = 5
# Safety ceiling when top_k is high; 0 in env means use top_k only (no extra cap).
DEFAULT_RAG_MAX_CONTEXTS_CEILING = 20


def _read_env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def llm_context_chunk_limit(top_k: int | None = None) -> int:
    """
    Chunks sent to the chat LLM: min(saved top_k, RAG_MAX_CONTEXTS ceiling).

    When RAG_MAX_CONTEXTS is unset, defaults to DEFAULT_RAG_MAX_CONTEXTS_CEILING (20).
    Set RAG_MAX_CONTEXTS=0 in .env to disable the ceiling and use top_k only.
    """
    k = max(1, int(top_k) if top_k is not None else DEFAULT_TOP_K)
    ceiling = _read_env_int(RAG_MAX_CONTEXTS_ENV, DEFAULT_RAG_MAX_CONTEXTS_CEILING)
    if ceiling <= 0:
        return k
    return min(k, max(1, ceiling))
