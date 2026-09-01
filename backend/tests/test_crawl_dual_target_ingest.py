"""Crawl ingest honors per-source embedding target selection."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.rag.embedding_resolver import IngestEmbeddingTarget


def _sample_doc():
    doc = MagicMock()
    doc.url = "https://example.com/"
    doc.title = "Example"
    doc.text_content = "Hello world content for embedding."
    doc.meta_data = {}
    return doc


def _sample_source(*, ingest_embedding_target=None):
    source = MagicMock()
    source.id = uuid.uuid4()
    source.project_id = uuid.uuid4()
    source.created_by_id = 1
    source.ingest_embedding_target = ingest_embedding_target
    return source


@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch("app.services.rag.embedding_resolver.resolve_crawl_ingest_targets")
@patch(
    "app.services.rag.utils_rag.chunks_for_crawled_document",
    return_value=["chunk-a", "chunk-b", "chunk-c"],
)
def test_crawl_ingest_legacy_null_target_uses_resolver(mock_chunks, mock_targets, mock_write):
    from app.services.crawler import _ingest_crawl_documents_for_source

    source = _sample_source(ingest_embedding_target=None)
    mock_targets.return_value = [
        IngestEmbeddingTarget(
            source="chat",
            provider="mistral",
            model="mistral-embed",
            api_key="chat-key",
            collection="proj_mistral",
        )
    ]
    mock_write.return_value = {
        "status": "Indexed",
        "chunks": 3,
        "collection": "proj_mistral",
    }

    result = _ingest_crawl_documents_for_source(MagicMock(), source, [_sample_doc()])

    assert result["chunks"] == 3
    assert mock_write.call_count == 1
    mock_targets.assert_called_once()
    assert mock_write.call_args[0][2]["embedding_provider"] == "mistral"
    mock_chunks.assert_called()


@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch("app.services.rag.embedding_resolver.resolve_crawl_ingest_targets")
@patch(
    "app.services.rag.utils_rag.chunks_for_crawled_document",
    return_value=["a", "b"],
)
def test_crawl_ingest_both_targets_dual_write(mock_chunks, mock_targets, mock_write):
    from app.services.crawler import _ingest_crawl_documents_for_source

    source = _sample_source(ingest_embedding_target="both")
    mock_targets.return_value = [
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
    mock_write.side_effect = [
        {"status": "Indexed", "chunks": 2, "collection": "proj_openai"},
        {"status": "Indexed", "chunks": 2, "collection": "proj_mistral"},
    ]

    result = _ingest_crawl_documents_for_source(MagicMock(), source, [_sample_doc()])

    assert result["chunks"] == 2
    assert mock_write.call_count == 2
    mock_targets.assert_called_once()
    assert mock_targets.call_args[0][2] == "both"
    mock_chunks.assert_called()


@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch("app.services.rag.embedding_resolver.resolve_crawl_ingest_targets")
@patch(
    "app.services.rag.utils_rag.chunks_for_crawled_document",
    return_value=["a"],
)
def test_crawl_ingest_explicit_embedding_skips_resolver(mock_chunks, mock_targets, mock_write):
    from app.services.crawler import _ingest_crawl_documents_for_source

    source = _sample_source(ingest_embedding_target="chat")
    mock_write.return_value = {
        "status": "Indexed",
        "chunks": 2,
        "collection": "proj_openai",
    }

    result = _ingest_crawl_documents_for_source(
        MagicMock(),
        source,
        [_sample_doc()],
        embedding_provider="openai",
        embedding_model="text-embedding-3-small",
        embedding_api_key="sk-test",
    )

    assert result["chunks"] == 2
    assert mock_write.call_count == 1
    mock_targets.assert_not_called()
    assert mock_write.call_args[0][2]["embedding_provider"] == "openai"
    mock_chunks.assert_called()
