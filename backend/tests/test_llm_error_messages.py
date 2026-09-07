from app.services.llm_error_messages import (
    format_embed_error_for_crawl,
    format_llm_error_for_user,
    is_llm_auth_error,
    is_llm_provider_infra_error,
    is_llm_rate_limit_error,
)
from app.services.rag.rag import RAG


def test_openai_concurrent_429():
    raw = "Error: too many concurrent requests (status code: 429)"
    msg = format_llm_error_for_user(raw)
    assert "status code" not in msg.lower()
    assert "too many" in msg.lower() or "wait" in msg.lower()


def test_rate_limit_generic():
    msg = format_llm_error_for_user("rate limit exceeded")
    assert "rate limit" in msg.lower()
    assert "wait" in msg.lower()


def test_mistral_rate_limited_includes_provider_model():
    raw = (
        'API error occurred: Status 429. Body: {"object":"error",'
        '"message":"Rate limit exceeded","type":"rate_limited","code":"1300"}'
    )
    msg = format_llm_error_for_user(
        raw, provider="mistral", model="mistral-small-latest"
    )
    assert "rate limit" in msg.lower()
    assert "mistral" in msg.lower()
    assert "mistral-small-latest" in msg
    assert "out of the context" not in msg.lower()


def test_is_llm_rate_limit_and_infra_detection():
    assert is_llm_rate_limit_error('{"type":"rate_limited","code":"1300"}')
    assert is_llm_provider_infra_error("Status 429 Rate limit exceeded")
    assert is_llm_provider_infra_error(TimeoutError("LLM stream timed out"))
    assert not is_llm_provider_infra_error("Status 403 Forbidden")


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


def test_fallback_after_llm_failure_returns_rate_limit_not_ooc_for_chat():
    rag = RAG.__new__(RAG)
    out = rag._fallback_answer_after_llm_failure(
        user_query="who is ceo of nitsan?",
        non_empty_contexts=["NITSAN is a TYPO3 agency."],
        retrieval_meta={"confidence_score": 80},
        mode="chat",
        exc=Exception(
            'API error occurred: Status 429. Body: {"message":"Rate limit exceeded",'
            '"type":"rate_limited"}'
        ),
        provider="mistral",
        model="mistral-small-latest",
    )
    assert "rate limit" in out.lower()
    assert "mistral" in out.lower()
    assert out != RAG.OUT_OF_CONTEXT_MSG
    assert "Key Details" not in out
    assert "Detail:" not in out
