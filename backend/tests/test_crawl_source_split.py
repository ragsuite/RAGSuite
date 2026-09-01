"""Crawl source split-on-create and legacy both migration helpers."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.rag.embedding_resolver import IngestEmbeddingTarget


def _targets_openai_mistral():
    return [
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


@patch("app.services.crawl_source_embedding.resolve_crawl_ingest_targets")
def test_crawl_create_ingest_targets_splits_both(mock_resolve):
    from app.services.crawl_source_embedding import crawl_create_ingest_targets

    mock_resolve.return_value = _targets_openai_mistral()
    project_id = uuid.uuid4()

    targets = crawl_create_ingest_targets(MagicMock(), project_id, "both")

    assert targets == ["search", "chat"]


@patch("app.services.crawl_source_embedding.resolve_crawl_ingest_targets")
def test_crawl_create_ingest_targets_both_same_collection(mock_resolve):
    from app.services.crawl_source_embedding import crawl_create_ingest_targets

    mock_resolve.return_value = [
        IngestEmbeddingTarget(
            source="chat",
            provider="openai",
            model="text-embedding-3-small",
            api_key="sk",
            collection="proj_openai",
        )
    ]
    project_id = uuid.uuid4()

    targets = crawl_create_ingest_targets(MagicMock(), project_id, "both")

    assert targets == ["chat"]


@patch("app.services.crawl_source_embedding.resolve_crawl_ingest_targets")
def test_split_legacy_both_crawl_source_creates_sibling(mock_resolve):
    from app.services.crawl_source_embedding import split_legacy_both_crawl_source

    db = MagicMock()
    source = MagicMock()
    source.ingest_embedding_target = "both"
    source.project_id = uuid.uuid4()
    source.name = "Example"
    source.base_url = "https://example.com"
    source.depth = 2
    source.cadence = "ONCE"
    source.headless = "OFF"
    source.allowlist = []
    source.denylist = []
    source.description = ""
    source.status = "READY"
    source.is_active = True
    source.max_pages = 2000
    source.max_runtime_minutes = 120
    source.max_links_per_page = 80
    source.content_length_limit = 10_000_000
    source.delay_seconds = 0.5
    source.skip_header_footer = True
    source.rescope_root_links = False
    source.allow_empty_crawl = False
    source.created_by_id = 1
    source.documents_count = 10
    source.trained_at = None
    source.last_crawl_at = None

    mock_resolve.return_value = _targets_openai_mistral()

    sibling = split_legacy_both_crawl_source(db, source)

    assert sibling is not None
    assert source.ingest_embedding_target == "search"
    assert sibling.ingest_embedding_target == "chat"
    assert sibling.documents_count == 0
    assert sibling.trained_at is None
    db.add.assert_called_once_with(sibling)
