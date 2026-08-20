"""Crawl ingest writes only the preferred embedding collection (not Search+Chat dual-write)."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch


@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch(
    "app.services.rag.embedding_resolver.resolve_ingest_for_project",
    return_value=("mistral", "mistral-embed", "chat-key"),
)
@patch(
    "app.services.rag.utils_rag.chunks_for_crawled_document",
    return_value=["chunk-a", "chunk-b", "chunk-c"],
)
def test_crawl_ingest_uses_preferred_ingest_only(mock_chunks, mock_resolve, mock_write):
    from app.services.crawler import _ingest_crawl_documents_for_source

    project_id = uuid.uuid4()
    source = MagicMock()
    source.id = uuid.uuid4()
    source.project_id = project_id
    source.created_by_id = 1

    doc = MagicMock()
    doc.url = "https://example.com/"
    doc.title = "Example"
    doc.text_content = "Hello world content for embedding."
    doc.meta_data = {}

    mock_write.return_value = {
        "status": "Indexed",
        "chunks": 3,
        "collection": "proj_mistral",
    }

    result = _ingest_crawl_documents_for_source(MagicMock(), source, [doc])

    assert result["chunks"] == 3
    assert mock_write.call_count == 1
    mock_resolve.assert_called_once()
    assert mock_write.call_args[0][2]["embedding_provider"] == "mistral"
    assert mock_write.call_args[0][2]["embedding_model"] == "mistral-embed"
    assert mock_write.call_args[0][2]["embedding_api_key"] == "chat-key"
    mock_chunks.assert_called()


@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch("app.services.rag.embedding_resolver.resolve_ingest_for_project")
@patch(
    "app.services.rag.utils_rag.chunks_for_crawled_document",
    return_value=["a", "b"],
)
def test_crawl_ingest_explicit_embedding_skips_resolver(
    mock_chunks, mock_resolve, mock_write
):
    from app.services.crawler import _ingest_crawl_documents_for_source

    source = MagicMock()
    source.id = uuid.uuid4()
    source.project_id = uuid.uuid4()
    source.created_by_id = 1

    doc = MagicMock()
    doc.url = "https://example.com/"
    doc.title = "Example"
    doc.text_content = "Hello world content for embedding."
    doc.meta_data = {}

    mock_write.return_value = {
        "status": "Indexed",
        "chunks": 2,
        "collection": "proj_openai",
    }

    result = _ingest_crawl_documents_for_source(
        MagicMock(),
        source,
        [doc],
        embedding_provider="openai",
        embedding_model="text-embedding-3-small",
        embedding_api_key="sk-test",
    )

    assert result["chunks"] == 2
    assert mock_write.call_count == 1
    mock_resolve.assert_not_called()
    assert mock_write.call_args[0][2]["embedding_provider"] == "openai"
    assert mock_write.call_args[0][2]["embedding_model"] == "text-embedding-3-small"
    mock_chunks.assert_called()
