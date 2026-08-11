from app.services.llm_error_messages import format_embed_error_for_crawl, format_llm_error_for_user


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
