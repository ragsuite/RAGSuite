from app.services.rag.context_limit_config import llm_context_chunk_limit


def test_llm_context_chunk_limit_follows_top_k(monkeypatch):
    monkeypatch.delenv("RAG_MAX_CONTEXTS", raising=False)
    assert llm_context_chunk_limit(5) == 5
    assert llm_context_chunk_limit(8) == 8


def test_llm_context_chunk_limit_respects_ceiling(monkeypatch):
    monkeypatch.setenv("RAG_MAX_CONTEXTS", "6")
    assert llm_context_chunk_limit(8) == 6
    assert llm_context_chunk_limit(4) == 4


def test_llm_context_chunk_limit_ceiling_zero_uses_top_k(monkeypatch):
    monkeypatch.setenv("RAG_MAX_CONTEXTS", "0")
    assert llm_context_chunk_limit(12) == 12


def test_llm_context_chunk_limit_defaults_when_top_k_missing(monkeypatch):
    monkeypatch.delenv("RAG_MAX_CONTEXTS", raising=False)
    assert llm_context_chunk_limit(None) == 5
