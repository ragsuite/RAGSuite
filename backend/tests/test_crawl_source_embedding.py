"""Tests for crawl source embedding display helpers."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.rag.embedding_resolver import IngestEmbeddingTarget


def _sample_source(*, ingest_embedding_target=None):
    source = MagicMock()
    source.id = uuid.uuid4()
    source.project_id = uuid.uuid4()
    source.ingest_embedding_target = ingest_embedding_target
    return source


@patch("app.services.crawl_source_embedding.resolve_crawl_ingest_targets")
def test_configured_crawl_embedding_models_both_returns_two(mock_resolve):
    from app.services.crawl_source_embedding import configured_crawl_embedding_models

    source = _sample_source(ingest_embedding_target="both")
    mock_resolve.return_value = [
        IngestEmbeddingTarget(
            source="search",
            provider="openai",
            model="text-embedding-3-small",
            api_key="sk-search",
            collection="proj_openai",
        ),
        IngestEmbeddingTarget(
            source="chat",
            provider="mistral",
            model="mistral-embed",
            api_key="sk-chat",
            collection="proj_mistral",
        ),
    ]

    models = configured_crawl_embedding_models(MagicMock(), source)

    assert len(models) == 2
    assert models[0]["source"] == "search"
    assert models[0]["provider"] == "openai"
    assert models[1]["source"] == "chat"
    assert models[1]["provider"] == "mistral"


@patch("app.services.crawl_source_embedding.configured_crawl_embedding_models")
def test_indexed_embedding_models_for_search_target_ignores_chat_vectors(mock_configured):
    from app.services.crawl_source_embedding import indexed_embedding_models_for_sources

    source = _sample_source(ingest_embedding_target="search")
    sid = str(source.id)
    mock_configured.return_value = [
        {
            "source": "search",
            "provider": "openai",
            "model": "text-embedding-3-small",
            "collection": "proj_openai",
        }
    ]
    embedded_by_id = {
        sid: [
            {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": "proj_mistral",
            },
            {
                "provider": "openai",
                "model": "text-embedding-3-small",
                "collection": "proj_openai",
            },
        ]
    }

    result = indexed_embedding_models_for_sources(
        MagicMock(),
        source.project_id,
        [source],
        embedded_by_id=embedded_by_id,
    )

    assert result[sid] == [
        {
            "provider": "openai",
            "model": "text-embedding-3-small",
            "collection": "proj_openai",
            "source": "search",
        }
    ]


@patch("app.services.crawl_source_embedding.configured_crawl_embedding_models")
def test_indexed_embedding_models_for_search_target_falls_back_to_configured(mock_configured):
    from app.services.crawl_source_embedding import indexed_embedding_models_for_sources

    source = _sample_source(ingest_embedding_target="search")
    sid = str(source.id)
    mock_configured.return_value = [
        {
            "source": "search",
            "provider": "openai",
            "model": "text-embedding-3-small",
            "collection": "proj_openai",
        }
    ]
    embedded_by_id = {
        sid: [
            {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": "proj_mistral",
            }
        ]
    }

    result = indexed_embedding_models_for_sources(
        MagicMock(),
        source.project_id,
        [source],
        embedded_by_id=embedded_by_id,
    )

    assert result[sid] == mock_configured.return_value


@patch("app.services.crawl_source_embedding.configured_crawl_embedding_models")
def test_indexed_embedding_models_for_chat_target_tags_actual_vectors(mock_configured):
    from app.services.crawl_source_embedding import indexed_embedding_models_for_sources

    source = _sample_source(ingest_embedding_target="chat")
    sid = str(source.id)
    mock_configured.return_value = [
        {
            "source": "chat",
            "provider": "openai",
            "model": "text-embedding-3-small",
            "collection": "proj_openai",
        }
    ]
    embedded_by_id = {
        sid: [
            {
                "provider": "openai",
                "model": "text-embedding-3-small",
                "collection": "proj_openai",
            }
        ]
    }

    result = indexed_embedding_models_for_sources(
        MagicMock(),
        source.project_id,
        [source],
        embedded_by_id=embedded_by_id,
    )

    assert result[sid] == [
        {
            "provider": "openai",
            "model": "text-embedding-3-small",
            "collection": "proj_openai",
            "source": "chat",
        }
    ]


@patch("app.services.crawl_source_embedding.configured_crawl_embedding_models")
@patch("app.services.crawl_source_embedding.build_embedding_target_options")
def test_indexed_embedding_models_for_legacy_null_tags_inferred_surface(
    mock_options,
    mock_configured,
):
    from app.services.crawl_source_embedding import indexed_embedding_models_for_sources

    source = _sample_source(ingest_embedding_target=None)
    sid = str(source.id)
    mock_configured.return_value = []
    mock_options.return_value = {
        "search": {
            "source": "search",
            "provider": "openai",
            "model": "text-embedding-3-small",
            "collection": "proj_openai",
        },
        "chat": {
            "source": "chat",
            "provider": "mistral",
            "model": "mistral-embed",
            "collection": "proj_mistral",
        },
        "same_collection": False,
        "default_target": "chat",
    }
    embedded_by_id = {
        sid: [
            {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": "proj_mistral",
            }
        ]
    }

    result = indexed_embedding_models_for_sources(
        MagicMock(),
        source.project_id,
        [source],
        embedded_by_id=embedded_by_id,
    )

    assert result[sid] == [
        {
            "provider": "mistral",
            "model": "mistral-embed",
            "collection": "proj_mistral",
            "source": "chat",
        }
    ]
