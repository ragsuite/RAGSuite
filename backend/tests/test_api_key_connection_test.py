"""Tests for Model Settings connection-test API key gating."""

from app.utils.api_key import (
    missing_hosted_api_key_test_message,
    normalize_provider_for_connection_test,
    resolve_usable_api_key_for_connection_test,
)


def test_normalize_provider_for_connection_test():
    assert normalize_provider_for_connection_test("Google Gemini") == "gemini"
    assert normalize_provider_for_connection_test("custom-llm") == "ollama"
    assert normalize_provider_for_connection_test("OpenAI") == "openai"


def test_hosted_without_key_returns_clear_failure(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.usable_api_key_for_provider",
        lambda _provider, _key: None,
    )
    key, failure = resolve_usable_api_key_for_connection_test("gemini", "", None)
    assert key is None
    assert failure is not None
    assert "API key required for gemini" in failure
    assert "does not need an API key" in failure


def test_ollama_placeholder_rejected_for_hosted(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda key: bool(key),
    )
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.usable_api_key_for_provider",
        lambda _provider, _key: None,
    )
    key, failure = resolve_usable_api_key_for_connection_test(
        "gemini",
        "",
        "rag-suite_placeholder",
    )
    assert key is None
    assert failure is not None
    assert "gemini" in failure


def test_ollama_provider_allows_missing_key():
    key, failure = resolve_usable_api_key_for_connection_test("ollama", "", None)
    assert failure is None
    assert key is None


def test_missing_hosted_message_mentions_fallback():
    msg = missing_hosted_api_key_test_message("mistral")
    assert msg.startswith("Failed:")
    assert "mistral" in msg
    assert "Ollama" in msg
