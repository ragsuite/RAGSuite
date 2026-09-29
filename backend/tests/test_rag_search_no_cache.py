"""Search and chatbot bypass the RAG answer cache (use_cache=False)."""
import ast
from pathlib import Path
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


def _is_rag_pipeline_attr(node: ast.AST, attr: str) -> bool:
    return (
        isinstance(node, ast.Attribute)
        and node.attr == attr
        and isinstance(node.value, ast.Name)
        and node.value.id == "rag_pipeline"
    )


def _use_cache_is_false(call: ast.Call) -> bool:
    return any(
        kw.arg == "use_cache" and isinstance(kw.value, ast.Constant) and kw.value.value is False
        for kw in call.keywords
    )


def test_chat_and_search_routes_bypass_answer_cache():
    source = (Path(__file__).resolve().parents[1] / "app" / "routes" / "rag.py").read_text()
    rag_calls = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Call):
            continue
        if _is_rag_pipeline_attr(node.func, "stream_query"):
            rag_calls.append(node)
        elif node.args and _is_rag_pipeline_attr(node.args[0], "query"):
            rag_calls.append(node)
    assert len(rag_calls) == 4, "expected chat, chat stream, search, search stream"
    missing = [call.lineno for call in rag_calls if not _use_cache_is_false(call)]
    assert not missing, f"rag_pipeline calls without use_cache=False at lines {missing}"
