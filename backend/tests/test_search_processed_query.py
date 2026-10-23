"""Search builds the same ProcessedQuery RAG.query would (no chat-only behaviour)."""
import uuid

from app.services.search_run_context import SearchRunContext, build_search_processed_query


def test_search_processed_query_matches_rag_processing(monkeypatch):
    monkeypatch.delenv("RAG_QUERY_PROCESSING", raising=False)
    pq = build_search_processed_query("Please show me phones under ₹20,000", "en")
    assert pq is not None
    assert pq.original == "Please show me phones under ₹20,000"
    assert pq.constraints.get("price_max") == 20000


def test_search_processed_query_detects_query_language_over_setting(monkeypatch):
    monkeypatch.delenv("RAG_QUERY_PROCESSING", raising=False)
    pq = build_search_processed_query("Wie kann ich meine Bestellung zurückgeben?", "en")
    assert pq is not None and pq.language == "de"


def test_search_processed_query_disabled(monkeypatch):
    monkeypatch.setenv("RAG_QUERY_PROCESSING", "0")
    assert build_search_processed_query("phones under 20000", "en") is None


def test_search_run_context_processed_query_is_optional():
    assert "processed_query" in SearchRunContext.__dataclass_fields__
    assert SearchRunContext.__dataclass_fields__["processed_query"].default is None


def test_search_run_context_constructs_with_keyword_blend():
    """Required fields must precede optional blend/rerank defaults (dataclass init)."""
    ctx = SearchRunContext(
        auth_type="user",
        user_id=1,
        api_key_id=None,
        project_id="p",
        project_uuid=uuid.uuid4(),
        llm_config_dict=None,
        system_prompt=None,
        search_language="en",
        search_format_type="html_long",
        max_tokens=500,
        search_top_k=8,
        search_similarity_threshold=0.3,
        search_use_reranker=False,
        search_session_id="search_1_abc",
        recent_search_history=[],
        embedding_provider=None,
        embedding_model=None,
        embedding_api_key=None,
        embedding_endpoint=None,
        embedding_api_version=None,
        search_keyword_blend=0.5,
    )
    assert ctx.search_keyword_blend == 0.5
    assert ctx.search_session_id == "search_1_abc"
    assert ctx.search_rerank_candidates is None
    assert ctx.processed_query is None
