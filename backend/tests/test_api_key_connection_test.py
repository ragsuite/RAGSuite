"""Tests for Model Settings connection-test API key gating."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.utils.api_key import (
    build_provider_api_key_masks,
    mask_api_key,
    missing_hosted_api_key_test_message,
    normalize_provider_for_connection_test,
    resolve_stored_provider_api_key,
    resolve_usable_api_key_for_connection_test,
)


def test_normalize_provider_for_connection_test():
    assert normalize_provider_for_connection_test("Google Gemini") == "gemini"
    assert normalize_provider_for_connection_test("custom-llm") == "ollama"
    assert normalize_provider_for_connection_test("OpenAI") == "openai"


def test_mask_api_key_hides_middle():
    assert mask_api_key("abcdefghijklmnop") == "abcd...mnop"
    assert mask_api_key("short") == "*****"
    assert mask_api_key(None) is None


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


def test_resolve_stored_provider_api_key_prefers_matching_profile(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    profile = SimpleNamespace(
        provider="mistral",
        api_key="mistral-secret-key-abcdefghijklmnopqrst",
        updated_at=2,
    )
    other = SimpleNamespace(
        provider="openai",
        api_key="openai-secret-key-abcdefghijklmnopqrst",
        updated_at=1,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = [profile, other]
    db = MagicMock()
    db.query.return_value = query

    key = resolve_stored_provider_api_key(
        db,
        user_id=1,
        project_id="proj",
        provider="mistral",
        profile_type="chat",
        settings_api_key="openai-secret-key-abcdefghijklmnopqrst",
        settings_provider="openai",
    )
    assert key == "mistral-secret-key-abcdefghijklmnopqrst"


def test_resolve_stored_provider_api_key_falls_back_when_settings_match(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = []
    db = MagicMock()
    db.query.return_value = query

    key = resolve_stored_provider_api_key(
        db,
        user_id=1,
        project_id="proj",
        provider="mistral",
        profile_type="chat",
        settings_api_key="mistral-settings-key-abcdefghijklmnop",
        settings_provider="mistral",
    )
    assert key == "mistral-settings-key-abcdefghijklmnop"


def test_build_provider_api_key_masks(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    profile = SimpleNamespace(
        provider="mistral",
        api_key="mistral-secret-key-abcdefghijklmnopqrst",
        updated_at=1,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = [profile]
    db = MagicMock()
    db.query.return_value = query

    masks = build_provider_api_key_masks(
        db,
        user_id=1,
        project_id="proj",
        profile_type="chat",
        active_provider="openai",
        active_api_key="openai-secret-key-abcdefghijklmnopqrst",
    )
    assert masks["mistral"].startswith("mist")
    assert "..." in masks["mistral"]
    assert masks["openai"].startswith("open")
