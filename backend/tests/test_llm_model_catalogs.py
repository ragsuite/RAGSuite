"""Tests for curated LLM catalogs, merge helpers, and discovery filters."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.utils.llm_model_catalogs import (
    ANTHROPIC_CHAT_MODEL_CATALOG,
    GEMINI_CHAT_MODEL_CATALOG,
    MISTRAL_CHAT_MODEL_CATALOG,
    OLLAMA_CHAT_MODEL_CATALOG,
    OPENAI_CHAT_MODEL_CATALOG,
    build_available_providers_payload,
    merge_model_entries,
)
from app.utils.provider_model_discovery import (
    _is_openai_chat_model_id,
    list_live_chat_models_for_provider,
)


# Previous curated ids that must never be dropped (additive expansion contract).
LEGACY_OPENAI = {
    "gpt-4",
    "gpt-4-turbo",
    "gpt-3.5-turbo",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-5.4",
    "gpt-5.4-pro",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
}
LEGACY_ANTHROPIC = {
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
    "claude-3-5-sonnet-20240620",
}
LEGACY_MISTRAL = {
    "mistral-small-latest",
    "ministral-8b-latest",
    "mistral-medium-latest",
    "mistral-large-latest",
    "open-mistral-nemo",
}
LEGACY_GEMINI = {
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-3-flash-preview",
}
LEGACY_OLLAMA = {
    "custom-default",
    "llama3:8b",
    "mistral",
    "gemma2",
    "gemma3:27b-cloud",
    "gemma4:31b-cloud",
}


def _values(catalog):
    return {row["value"] for row in catalog}


def test_curated_catalogs_keep_legacy_ids():
    assert LEGACY_OPENAI <= _values(OPENAI_CHAT_MODEL_CATALOG)
    assert LEGACY_ANTHROPIC <= _values(ANTHROPIC_CHAT_MODEL_CATALOG)
    assert LEGACY_MISTRAL <= _values(MISTRAL_CHAT_MODEL_CATALOG)
    assert LEGACY_GEMINI <= _values(GEMINI_CHAT_MODEL_CATALOG)
    assert LEGACY_OLLAMA <= _values(OLLAMA_CHAT_MODEL_CATALOG)


def test_mistral_catalog_includes_scoped_free_tier_models():
    values = _values(MISTRAL_CHAT_MODEL_CATALOG)
    assert "codestral-latest" in values
    assert "codestral-2508" in values
    assert "magistral-medium-latest" in values
    assert "magistral-small-latest" in values
    assert "labs-leanstral-1-5" in values
    assert "labs-leanstral-1-5-1" in values


def test_merge_model_entries_union_and_selected():
    curated = [{"name": "Mistral Large", "value": "mistral-large-latest"}]
    merged = merge_model_entries(
        curated,
        live_ids=["codestral-latest", "mistral-large-latest"],
        selected_ids=["custom-saved-model"],
    )
    values = [m["value"] for m in merged]
    assert values == ["mistral-large-latest", "codestral-latest", "custom-saved-model"]
    assert merged[0]["name"] == "Mistral Large"


def test_build_available_providers_payload_enrichment():
    payload = build_available_providers_payload(
        enrichments={
            "mistral": {
                "live_chat": ["codestral-latest"],
                "selected_chat": "legacy-mistral-id",
                "selected_embedding": "mistral-embed",
            }
        }
    )
    by_value = {row["value"]: row for row in payload}
    mistral = by_value["mistral"]
    chat_values = {m["value"] for m in mistral["chat_models"]}
    assert "mistral-large-latest" in chat_values
    assert "codestral-latest" in chat_values
    assert "legacy-mistral-id" in chat_values


def test_openai_chat_filter_excludes_embeddings():
    assert _is_openai_chat_model_id("gpt-4o")
    assert _is_openai_chat_model_id("o3")
    assert not _is_openai_chat_model_id("text-embedding-3-large")
    assert not _is_openai_chat_model_id("whisper-1")
    assert not _is_openai_chat_model_id("dall-e-3")


@patch("app.utils.mistral_models.list_mistral_chat_models_for_key")
def test_list_live_chat_models_mistral_filters_embed(mock_list):
    mock_list.return_value = ["mistral-small-latest", "mistral-embed", "codestral-latest"]
    models = list_live_chat_models_for_provider("mistral", api_key="sk-test")
    assert models == ["mistral-small-latest", "codestral-latest"]


def test_build_provider_enrichments_discovery_failure_falls_back():
    from app.utils.provider_model_discovery import build_provider_enrichments

    db = MagicMock()
    with patch(
        "app.utils.api_key.resolve_stored_provider_api_key",
        return_value="sk-test",
    ), patch(
        "app.utils.provider_model_discovery.list_live_chat_models_for_provider",
        side_effect=RuntimeError("boom"),
    ):
        enrichments = build_provider_enrichments(
            db=db,
            user_id=1,
            project_id="proj",
            profile_type="chat",
            settings_api_key="sk-test",
            settings_provider="mistral",
            selected_chat="mistral-large-latest",
            selected_embedding="mistral-embed",
        )
    assert enrichments["mistral"]["live_chat"] == []
    assert enrichments["mistral"]["selected_chat"] == "mistral-large-latest"
    payload = build_available_providers_payload(enrichments=enrichments)
    mistral = next(row for row in payload if row["value"] == "mistral")
    assert any(m["value"] == "mistral-large-latest" for m in mistral["chat_models"])
