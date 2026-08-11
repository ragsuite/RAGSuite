"""Tests for embedding resolver ingest source (EMBEDDING_PREFERRED_SOURCE)."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.rag.embedding_resolver import (
    preferred_ingest_source,
    resolve_ingest_for_project,
    resolve_upload_ingest_targets,
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