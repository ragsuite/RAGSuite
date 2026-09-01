"""Stale crawl embedding collection purge when ingest target changes."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.rag.embedding_resolver import IngestEmbeddingTarget


def _sample_source(*, ingest_embedding_target: str = "search"):
    source = MagicMock()
    source.id = uuid.uuid4()
    source.project_id = uuid.uuid4()
    source.ingest_embedding_target = ingest_embedding_target
    return source


@patch("app.services.rag.singleton.locked_delete_document_embeddings")
@patch("app.services.crawl_source_embedding.embedded_models_by_item_id")
@patch("app.services.crawl_source_embedding.resolve_crawl_ingest_targets")
def test_purge_stale_crawl_source_embedding_collections(
    mock_resolve,
    mock_embedded_by_id,
    mock_delete,
):
    from app.services.crawl_source_embedding import purge_stale_crawl_source_embedding_collections

    source = _sample_source(ingest_embedding_target="search")
    sid = str(source.id)

    mock_resolve.return_value = [
        IngestEmbeddingTarget(
            source="search",
            provider="openai",
            model="text-embedding-3-small",
            api_key="sk",
            collection="proj_openai",
        )
    ]
    mock_embedded_by_id.return_value = {
        sid: [
            {
                "provider": "openai",
                "model": "text-embedding-3-small",
                "collection": "proj_openai",
            },
            {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": "proj_mistral",
            },
        ]
    }

    purge_stale_crawl_source_embedding_collections(MagicMock(), source)

    mock_delete.assert_called_once_with(sid, collection_name="proj_mistral")


@patch("app.services.crawl_source_embedding.purge_stale_crawl_source_embedding_collections")
@patch("app.services.crawler._write_prepared_ingest_in_batches")
@patch("app.services.rag.embedding_resolver.resolve_crawl_ingest_targets")
@patch(
    "app.services.rag.utils_rag.chunks_for_crawled_document",
    return_value=["chunk-a"],
)
def test_crawl_ingest_purges_stale_collections_before_write(
    mock_chunks,
    mock_targets,
    mock_write,
    mock_purge,
):
    from app.services.crawler import _ingest_crawl_documents_for_source

    db = MagicMock()
    source = _sample_source(ingest_embedding_target="search")
    mock_targets.return_value = [
        IngestEmbeddingTarget(
            source="search",
            provider="openai",
            model="text-embedding-3-small",
            api_key="sk",
            collection="proj_openai",
        )
    ]
    mock_write.return_value = {"status": "Indexed", "chunks": 1, "collection": "proj_openai"}

    doc = MagicMock()
    doc.url = "https://example.com/"
    doc.title = "Example"
    doc.text_content = "Hello world content for embedding."
    doc.meta_data = {}

    _ingest_crawl_documents_for_source(db, source, [doc])

    mock_purge.assert_called_once_with(db, source)
    mock_chunks.assert_called()
