"""Tests for Model Settings connection-test API key gating."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from app.utils.api_key import (
    build_provider_api_key_masks,
    mask_api_key,
    missing_hosted_api_key_test_message,
    normalize_provider_for_connection_test,
    resolve_runtime_llm_api_key,
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


def test_resolve_runtime_llm_api_key_prefers_chat_profile(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    profile = SimpleNamespace(
        provider="openai",
        api_key="sk-profile-openai-key-abcdefghijklmnop",
        updated_at=1,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = [profile]
    db = MagicMock()
    db.query.return_value = query

    key = resolve_runtime_llm_api_key(
        db,
        user_id=1,
        project_id="proj",
        provider="openai",
        profile_type="chat",
        settings_api_key="",
        settings_provider="openai",
    )
    assert key == "sk-profile-openai-key-abcdefghijklmnop"


def test_resolve_runtime_llm_api_key_same_family_settings_wins_over_stale_profile(
    monkeypatch,
):
    """Active Model Settings key must not be shadowed by a stale profile key."""
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    profile = SimpleNamespace(
        provider="mistral",
        api_key="mistral-stale-profile-key-abcdefghij",
        updated_at=99,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = [profile]
    db = MagicMock()
    db.query.return_value = query

    key = resolve_runtime_llm_api_key(
        db,
        user_id=2,
        project_id="proj",
        provider="mistral",
        profile_type="search",
        settings_api_key="mistral-fresh-settings-key-abcdefghij",
        settings_provider="mistral",
    )
    assert key == "mistral-fresh-settings-key-abcdefghij"

    chat_key = resolve_runtime_llm_api_key(
        db,
        user_id=2,
        project_id="proj",
        provider="mistral",
        profile_type="chat",
        settings_api_key="mistral-fresh-chat-settings-abcdefgh",
        settings_provider="mistral",
    )
    assert chat_key == "mistral-fresh-chat-settings-abcdefgh"


def test_resolve_runtime_llm_api_key_prefers_search_profile(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    profile = SimpleNamespace(
        provider="mistral",
        api_key="mistral-search-profile-key-abcdefghij",
        updated_at=1,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = [profile]
    db = MagicMock()
    db.query.return_value = query

    key = resolve_runtime_llm_api_key(
        db,
        user_id=2,
        project_id="proj",
        provider="mistral",
        profile_type="search",
        settings_api_key="wrong-provider-key-abcdefghijklmnop",
        settings_provider="openai",
    )
    assert key == "mistral-search-profile-key-abcdefghij"


def test_resolve_runtime_llm_api_key_no_user_falls_back_to_settings():
    key = resolve_runtime_llm_api_key(
        MagicMock(),
        user_id=None,
        project_id="proj",
        provider="openai",
        profile_type="chat",
        settings_api_key="sk-settings-only-key-abcdefghijklmnop",
        settings_provider="openai",
    )
    assert key == "sk-settings-only-key-abcdefghijklmnop"


def test_resolve_runtime_llm_api_key_falls_back_when_profile_empty(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = []
    db = MagicMock()
    db.query.return_value = query

    key = resolve_runtime_llm_api_key(
        db,
        user_id=1,
        project_id="proj",
        provider="openai",
        profile_type="chat",
        settings_api_key="sk-settings-fallback-abcdefghijklmnop",
        settings_provider="openai",
    )
    assert key == "sk-settings-fallback-abcdefghijklmnop"


def test_sync_chat_key_after_successful_test_backfills_empty_settings(monkeypatch):
    from app.routes.chat_models import _sync_chat_key_after_successful_test

    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    upsert_calls = []

    def _fake_upsert(db, user_id, settings):
        upsert_calls.append((user_id, settings.api_key))

    monkeypatch.setattr(
        "app.routes.chat_models._upsert_chat_model_config_profile",
        _fake_upsert,
    )

    settings = SimpleNamespace(api_key="", model_provider="mistral", project_id="proj")
    db = MagicMock()

    _sync_chat_key_after_successful_test(
        db,
        user_id=7,
        chatbot_settings=settings,
        provider_key="mistral",
        resolved_api_key="mistral-working-key-abcdefghijklmnop",
    )

    assert settings.api_key == "mistral-working-key-abcdefghijklmnop"
    assert upsert_calls == [(7, "mistral-working-key-abcdefghijklmnop")]
    db.commit.assert_called()


def test_sync_chat_key_after_successful_test_upserts_when_settings_already_usable(
    monkeypatch,
):
    from app.routes.chat_models import _sync_chat_key_after_successful_test

    monkeypatch.setattr(
        "app.services.rag.embedder_factory.is_ollama_placeholder_api_key",
        lambda _key: False,
    )
    upsert_calls = []

    def _fake_upsert(db, user_id, settings):
        upsert_calls.append(settings.api_key)

    monkeypatch.setattr(
        "app.routes.chat_models._upsert_chat_model_config_profile",
        _fake_upsert,
    )

    settings = SimpleNamespace(
        api_key="mistral-fresh-settings-key-abcdefghij",
        model_provider="mistral",
        project_id="proj",
    )
    db = MagicMock()

    _sync_chat_key_after_successful_test(
        db,
        user_id=7,
        chatbot_settings=settings,
        provider_key="mistral",
        resolved_api_key="mistral-fresh-settings-key-abcdefghij",
    )

    # Do not overwrite an already-usable settings key; still sync profile.
    assert settings.api_key == "mistral-fresh-settings-key-abcdefghij"
    assert upsert_calls == ["mistral-fresh-settings-key-abcdefghij"]
    db.commit.assert_not_called()
