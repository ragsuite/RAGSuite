from app.services.llm_error_messages import (
    format_embed_error_for_crawl,
    format_llm_error_for_user,
    is_llm_auth_error,
)
from app.services.rag.rag import RAG


def test_openai_concurrent_429():
    raw = "Error: too many concurrent requests (status code: 429)"
    msg = format_llm_error_for_user(raw)
    assert "status code" not in msg.lower()
    assert "too many" in msg.lower() or "wait" in msg.lower()


def test_rate_limit_generic():
    msg = format_llm_error_for_user("rate limit exceeded")
    assert "wait" in msg.lower()


def test_format_embed_error_for_crawl():
    msg = format_embed_error_for_crawl("429 Rate limit exceeded")
    assert "rate limit" in msg.lower()
    assert "automatically" in msg.lower()


def test_is_llm_auth_error_detects_403_without_api_key_phrase():
    assert is_llm_auth_error("Error: Status 403 Forbidden")
    assert is_llm_auth_error("access denied for model mistral-large-latest")


def test_format_llm_error_for_user_maps_403():
    msg = format_llm_error_for_user("Status 403 Forbidden")
    assert "credentials" in msg.lower()


def test_fallback_after_llm_failure_returns_credentials_not_ooc():
    rag = RAG.__new__(RAG)
    out = rag._fallback_answer_after_llm_failure(
        user_query="what is nitsan?",
        non_empty_contexts=["NITSAN is a digital agency based in India."],
        retrieval_meta={"confidence_score": 80},
        mode="chat",
        exc=Exception("Status 403 Forbidden"),
    )
    assert "credentials" in out.lower()
    assert out != RAG.OUT_OF_CONTEXT_MSG
