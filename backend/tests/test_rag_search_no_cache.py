"""Search bypasses the RAG answer cache (use_cache=False); chatbot keeps the default."""
from unittest.mock import MagicMock

from app.services.rag.rag import RAG, RAGPipeline


class _StubRetriever:
    default_top_k = 5


CACHED_RESULT = {
    "summary": "Cached answer",
    "raw_contexts": ["chunk"],
    "raw_chunk_similarity_pct": [90],
    "top_k": {"Top Searches Found 1": "snippet"},
    "retrieval_meta": {"tier_used": 1},
}


def _rag_with_seeded_cache(monkeypatch):
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    rag.redis_client = None
    rag._query_cache.clear()
    monkeypatch.setattr(rag, "_make_cache_keys", lambda *a, **k: ("rag_summary:k", "local_k"))
    monkeypatch.setattr(rag, "_is_sensitive_query", lambda _q: True)
    rag._query_cache["local_k"] = dict(CACHED_RESULT)
    set_keys = []
    original_set = rag._set_cached

    def _spy_set(redis_key, local_key, result):
        set_keys.append(redis_key)
        return original_set(redis_key, local_key, result)

    monkeypatch.setattr(rag, "_set_cached", _spy_set)
    return rag, set_keys


def test_query_default_uses_cache(monkeypatch):
    rag, _ = _rag_with_seeded_cache(monkeypatch)
    assert rag.query("What is RAG?")["summary"] == "Cached answer"


def test_query_without_cache_skips_read_and_write(monkeypatch):
    rag, set_keys = _rag_with_seeded_cache(monkeypatch)
    result = rag.query("What is RAG?", use_cache=False)
    assert result["summary"] == RAG.PRIVACY_BLOCK_MSG
    assert all(key is None for key in set_keys)
    assert rag._query_cache == {"local_k": CACHED_RESULT}


def test_stream_query_default_replays_cache(monkeypatch):
    rag, _ = _rag_with_seeded_cache(monkeypatch)
    chunks = list(rag.stream_query(user_query="What is RAG?"))
    assert chunks[0][0] == "Cached answer"
    assert chunks[-1][1]["from_cache"] is True


def test_stream_query_without_cache_does_not_replay(monkeypatch):
    rag, set_keys = _rag_with_seeded_cache(monkeypatch)
    chunks = list(rag.stream_query(user_query="What is RAG?", use_cache=False))
    assert "Cached answer" not in "".join(text for text, _ in chunks)
    assert not any((meta or {}).get("from_cache") for _, meta in chunks)
    assert all(key is None for key in set_keys)


def test_pipeline_forwards_use_cache():
    pipeline = object.__new__(RAGPipeline)
    pipeline.rag = MagicMock()
    pipeline.query("q", use_cache=False)
    pipeline.stream_query("q", use_cache=False)
    assert pipeline.rag.query.call_args.kwargs["use_cache"] is False
    assert pipeline.rag.stream_query.call_args.kwargs["use_cache"] is False
    pipeline.query("q")
    assert pipeline.rag.query.call_args.kwargs["use_cache"] is True
