"""Tests for embedding resolver ingest source (EMBEDDING_PREFERRED_SOURCE)."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.rag.embedder_factory import (
    JINA_FALLBACK_MODEL,
    JINA_FALLBACK_PROVIDER,
    resolve_embedding,
    usable_api_key_for_provider,
)
from app.services.rag.embedding_resolver import (
    describe_saved_embedding_settings,
    preferred_ingest_source,
    resolve_ingest_for_project,
    resolve_upload_ingest_targets,
    saved_embedding_fallback_used,
)


def test_preferred_ingest_source_defaults_search():
    with patch("app.services.rag.embedding_resolver.settings") as mock_settings:
        mock_settings.embedding_preferred_source = "search"
        assert preferred_ingest_source() == "search"


def test_preferred_ingest_source_chat():
    with patch("app.services.rag.embedding_resolver.settings") as mock_settings:
        mock_settings.embedding_preferred_source = "chat"
        assert preferred_ingest_source() == "chat"


@patch("app.services.rag.embedding_resolver.settings")
@patch("app.services.rag.embedding_resolver._read_chatbot_settings")
def test_resolve_ingest_for_project_uses_chat_settings(mock_chat, mock_settings):
    mock_settings.embedding_preferred_source = "chat"
    row = MagicMock()
    row.model_provider = "mistral"
    row.embedding_model = "mistral-embed"
    row.api_key = "test-key"
    mock_chat.return_value = row

    db = MagicMock()
    project_id = uuid.uuid4()
    provider, model, api_key = resolve_ingest_for_project(db, project_id)

    assert provider == "mistral"
    assert model == "mistral-embed"
    assert api_key == "test-key"
    mock_chat.assert_called_once()


@patch("app.services.rag.embedding_resolver.settings")
@patch("app.services.rag.embedding_resolver._read_search_settings")
def test_resolve_ingest_for_project_uses_search_settings(mock_search, mock_settings):
    mock_settings.embedding_preferred_source = "search"
    row = MagicMock()
    row.model_provider = "openai"
    row.embedding_model = "text-embedding-3-small"
    row.api_key = "sk-test"
    mock_search.return_value = row

    db = MagicMock()
    project_id = uuid.uuid4()
    provider, model, api_key = resolve_ingest_for_project(db, project_id)

    assert provider == "openai"
    assert model == "text-embedding-3-small"
    assert api_key == "sk-test"
    mock_search.assert_called_once()


@patch("app.services.rag.embedding_resolver.preferred_ingest_source", return_value="search")
@patch("app.services.rag.embedding_resolver.resolve_for_project")
def test_resolve_upload_ingest_targets_search_and_chat(mock_resolve, _preferred):
    mock_resolve.side_effect = [
        ("openai", "text-embedding-3-small", "sk-search"),
        ("mistral", "mistral-embed", "sk-chat"),
    ]

    db = MagicMock()
    project_id = uuid.uuid4()
    targets = resolve_upload_ingest_targets(db, project_id)

    assert len(targets) == 2
    assert targets[0].source == "search"
    assert targets[0].provider == "openai"
    assert targets[1].source == "chat"
    assert targets[1].provider == "mistral"
    assert mock_resolve.call_count == 2


@patch("app.services.rag.embedding_resolver.preferred_ingest_source", return_value="search")
@patch("app.services.rag.embedding_resolver.resolve_for_project")
def test_resolve_upload_ingest_targets_dedupes_same_collection(mock_resolve, _preferred):
    mock_resolve.side_effect = [
        ("mistral", "mistral-embed", "search-key"),
        ("mistral", "mistral-embed", "chat-key"),
    ]

    db = MagicMock()
    project_id = uuid.uuid4()
    targets = resolve_upload_ingest_targets(db, project_id)

    assert len(targets) == 1
    assert targets[0].source == "search"
    assert targets[0].api_key == "search-key"


@patch("app.services.rag.embedding_resolver.preferred_ingest_source", return_value="chat")
@patch("app.services.rag.embedding_resolver.resolve_for_project")
def test_resolve_upload_ingest_targets_prefers_chat_key_on_collision(mock_resolve, _preferred):
    """Search often stores an LLM proxy key; Chat holds the real embed key."""
    mock_resolve.side_effect = [
        ("mistral", "mistral-embed", "PH6Q8eqrW7DSingIrealkeyxxxx"),  # chat first
        ("mistral", "mistral-embed", "rgs_llm_ZLuHD2iDproxykeyxxxx"),  # search skipped
    ]

    db = MagicMock()
    project_id = uuid.uuid4()
    targets = resolve_upload_ingest_targets(db, project_id)

    assert len(targets) == 1
    assert targets[0].source == "chat"
    assert targets[0].api_key == "PH6Q8eqrW7DSingIrealkeyxxxx"
    assert not targets[0].api_key.startswith("rgs_")


@patch("app.services.rag.embedding_resolver.preferred_ingest_source", return_value="chat")
@patch("app.services.rag.embedding_resolver.resolve_for_project")
def test_resolve_reindex_for_project_uses_preferred_key_on_shared_collection(mock_resolve, _preferred):
    from app.services.rag.embedding_resolver import resolve_reindex_for_project

    project_id = uuid.uuid4()
    mock_resolve.side_effect = [
        ("mistral", "mistral-embed", "rgs_llm_proxy_search_key"),  # requested search
        ("mistral", "mistral-embed", "PH6Q8eqrW7DSingIrealkeyxxxx"),  # preferred chat
    ]

    provider, model, api_key = resolve_reindex_for_project(MagicMock(), project_id, source="search")

    assert provider == "mistral"
    assert model == "mistral-embed"
    assert api_key == "PH6Q8eqrW7DSingIrealkeyxxxx"
    assert mock_resolve.call_count == 2


@patch("app.services.rag.embedding_resolver.preferred_ingest_source", return_value="chat")
@patch("app.services.rag.embedding_resolver.resolve_for_project")
def test_resolve_reindex_for_project_keeps_distinct_collection_keys(mock_resolve, _preferred):
    from app.services.rag.embedding_resolver import resolve_reindex_for_project

    project_id = uuid.uuid4()
    mock_resolve.side_effect = [
        ("openai", "text-embedding-3-small", "sk-search"),
        ("mistral", "mistral-embed", "sk-chat"),
    ]

    provider, model, api_key = resolve_reindex_for_project(MagicMock(), project_id, source="search")

    assert provider == "openai"
    assert model == "text-embedding-3-small"
    assert api_key == "sk-search"


@patch("app.services.rag.embedder_factory._ollama_placeholder_api_key", return_value="ollama-static-placeholder")
def test_usable_api_key_rejects_ollama_placeholder_for_hosted(_placeholder):
    assert usable_api_key_for_provider("openai", "ollama-static-placeholder") is None
    assert usable_api_key_for_provider("openai", "sk-real-openai-key-xxxxx") == "sk-real-openai-key-xxxxx"
    assert usable_api_key_for_provider("ollama", "ollama-static-placeholder") == "ollama-static-placeholder"


@patch("app.services.rag.embedder_factory._ollama_placeholder_api_key", return_value="ollama-static-placeholder")
def test_resolve_embedding_falls_back_when_hosted_has_placeholder(_placeholder):
    provider, model, api_key = resolve_embedding(
        "openai", "text-embedding-3-small", "ollama-static-placeholder"
    )
    assert provider == JINA_FALLBACK_PROVIDER
    assert model == JINA_FALLBACK_MODEL
    assert api_key is None


@patch("app.services.rag.embedder_factory._ollama_placeholder_api_key", return_value="ollama-static-placeholder")
def test_resolve_embedding_keeps_openai_with_real_key(_placeholder):
    provider, model, api_key = resolve_embedding(
        "openai", "text-embedding-3-small", "sk-real-openai-key-xxxxx"
    )
    assert provider == "openai"
    assert model == "text-embedding-3-small"
    assert api_key == "sk-real-openai-key-xxxxx"


@patch("app.services.rag.embedding_resolver._read_chatbot_settings")
@patch("app.services.rag.embedder_factory._ollama_placeholder_api_key", return_value="ollama-static-placeholder")
def test_describe_saved_embedding_settings_reports_missing_key(_placeholder, mock_chat):
    row = MagicMock()
    row.model_provider = "openai"
    row.embedding_model = "text-embedding-3-small"
    row.api_key = "ollama-static-placeholder"
    mock_chat.return_value = row

    saved_provider, saved_model, configured = describe_saved_embedding_settings(
        MagicMock(), uuid.uuid4(), "chat"
    )
    assert saved_provider == "openai"
    assert saved_model == "text-embedding-3-small"
    assert configured is False


@patch("app.services.rag.embedding_resolver._read_chatbot_settings")
@patch("app.services.rag.embedder_factory._ollama_placeholder_api_key", return_value="ollama-static-placeholder")
def test_saved_embedding_fallback_used_with_placeholder(_placeholder, mock_chat):
    row = MagicMock()
    row.model_provider = "openai"
    row.embedding_model = "text-embedding-3-small"
    row.api_key = "ollama-static-placeholder"
    mock_chat.return_value = row

    assert saved_embedding_fallback_used(
        MagicMock(),
        uuid.uuid4(),
        "chat",
        JINA_FALLBACK_PROVIDER,
        JINA_FALLBACK_MODEL,
    ) is True


def test_ollama_save_preserves_hosted_api_key_logic():
    """Mirror chat/search route rule: do not overwrite a real key with the static placeholder."""
    static_key = "ollama-static-placeholder"
    existing = "sk-real-openai-key-xxxxx"
    update_data = {"api_key": "should-not-matter"}
    if existing and existing != static_key:
        update_data.pop("api_key", None)
    else:
        update_data["api_key"] = static_key
    assert "api_key" not in update_data
