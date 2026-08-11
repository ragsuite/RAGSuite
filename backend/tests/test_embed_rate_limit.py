"""Tests for provider-agnostic embedding rate-limit helpers."""
from datetime import datetime, timezone

from app.services.embed_rate_limit import (
    EmbeddingRateLimitError,
    embed_retry_delay_seconds,
    is_embed_non_retryable_error,
    is_embed_rate_limit_error,
    rate_limit_job_retry_after,
)
from app.services.llm_error_messages import format_embed_error_for_crawl


def test_mistral_429_is_rate_limit():
    exc = (
        'API error occurred: Status 429. Body: {"message":"Rate limit exceeded",'
        '"type":"rate_limited","code":"1300"}'
    )
    assert is_embed_rate_limit_error(exc)


def test_openai_concurrent_429():
    assert is_embed_rate_limit_error("Error: too many concurrent requests (status code: 429)")


def test_invalid_api_key_non_retryable():
    assert is_embed_non_retryable_error("401 Unauthorized: invalid api key")


def test_embedding_rate_limit_error_type():
    assert is_embed_rate_limit_error(EmbeddingRateLimitError("429"))


def test_embed_retry_delay_exponential():
    delay = embed_retry_delay_seconds("429 rate limit", 3, base_delay=2.0, cap_seconds=300.0)
    assert delay == 8.0


def test_embed_retry_delay_respects_retry_after():
    delay = embed_retry_delay_seconds('retry-after: 45', 1, base_delay=2.0, cap_seconds=300.0)
    assert delay == 45.0


def test_rate_limit_job_retry_after_future():
    when = rate_limit_job_retry_after(2, base_delay_seconds=30, cap_seconds=600)
    assert when > datetime.now(timezone.utc)


def test_format_embed_error_for_crawl_rate_limit():
    msg = format_embed_error_for_crawl("429 Rate limit exceeded")
    assert "rate limit" in msg.lower()
    assert "automatically" in msg.lower()
