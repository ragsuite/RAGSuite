"""RAG cache policy: do not cache no-context answers."""
from app.services.rag.rag import RAG


class _StubRetriever:
    default_top_k = 5


def test_should_not_cache_empty_contexts():
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    assert rag._should_cache_query_result(
        {
            "summary": RAG.OUT_OF_CONTEXT_MSG,
            "raw_contexts": [],
            "top_k": {},
            "retrieval_meta": {},
        }
    ) is False


def test_should_cache_grounded_answer():
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    assert rag._should_cache_query_result(
        {
            "summary": "Answer from docs",
            "raw_contexts": ["some chunk text"],
            "top_k": {"Top Searches Found 1": "snippet"},
            "retrieval_meta": {"tier_used": 1},
        }
    ) is True


def test_set_cached_skips_no_context():
    rag = RAG(retriever=_StubRetriever(), llm_model="stub")
    rag._query_cache.clear()
    rag._set_cached(
        "rag_summary:test",
        "local_test",
        {
            "summary": RAG.OUT_OF_CONTEXT_MSG,
            "raw_contexts": [],
            "top_k": {},
        },
    )
    assert "local_test" not in rag._query_cache
