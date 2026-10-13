"""Search builds the same ProcessedQuery RAG.query would (no chat-only behaviour)."""
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
