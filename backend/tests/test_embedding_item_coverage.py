"""Tests for per-item embedding coverage (documents + crawl sources)."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services.rag.embedder_factory import collection_name_for
from app.services.reindex_service import (
    _collection_to_provider_model,
    _coverage_item_ids_from_metadata,
    document_ids_in_active_collection,
    get_item_embedding_coverage,
    invalidate_item_embedding_coverage_cache,
)


@pytest.fixture(autouse=True)
def clear_coverage_cache():
    invalidate_item_embedding_coverage_cache(None)
    yield
    invalidate_item_embedding_coverage_cache(None)


def test_collection_to_provider_model_legacy():
    assert _collection_to_provider_model("rag_collection") == ("ollama", "jina/jina-embeddings-v2-base-de")


def test_collection_to_provider_model_named():
    name = "proj_abc123__mistral__mistral_embed"
    assert _collection_to_provider_model(name) == ("mistral", "mistral_embed")


def test_collection_to_provider_model_hashed_mistral():
    project_id = "4cda6c6c-20ea-44b2-8e19-18322ad2bead"
    collection = collection_name_for(project_id, "mistral", "mistral-embed")
    provider, model = _collection_to_provider_model(collection, project_id)
    assert provider == "mistral"
    assert model == "mistral-embed"


def test_collection_to_provider_model_unknown():
    assert _collection_to_provider_model("unknown_name") == (None, None)


def test_coverage_item_ids_from_metadata_upload_document_id():
    doc_id = str(uuid.uuid4())
    assert _coverage_item_ids_from_metadata({"document_id": doc_id}) == {doc_id}


def test_coverage_item_ids_from_metadata_crawl_source_file():
    crawl_id = str(uuid.uuid4())
    page_id = str(uuid.uuid4())
    ids = _coverage_item_ids_from_metadata(
        {
            "document_id": page_id,
            "source_file": f"crawl_source_{crawl_id}",
            "source_type": "crawl",
        }
    )
    assert ids == {page_id, crawl_id}


def test_coverage_item_ids_from_metadata_crawl_source_file_only():
    crawl_id = str(uuid.uuid4())
    ids = _coverage_item_ids_from_metadata(
        {"source_file": f"crawl_source_{crawl_id}", "source_type": "crawl"}
    )
    assert ids == {crawl_id}


@patch("app.services.reindex_service._project_metadatas_in_collection")
def test_document_ids_in_active_collection_uses_source_file(mock_metas):
    crawl_id = str(uuid.uuid4())
    page_id = str(uuid.uuid4())
    mock_metas.return_value = [
        {
            "document_id": page_id,
            "source_file": f"crawl_source_{crawl_id}",
            "project_id": "proj-1",
        }
    ]
    found = document_ids_in_active_collection("proj-1", "rag_collection")
    assert crawl_id in found
    assert page_id in found


def test_invalidate_cache_scoped_to_project():
    from app.services import reindex_service as mod

    pid_a = "project-a"
    pid_b = "project-b"
    key_a = (pid_a, "chat", "coll-a")
    key_b = (pid_b, "chat", "coll-b")
    mod._ITEM_COVERAGE_CACHE[key_a] = (0.0, {"project_id": pid_a})
    mod._ITEM_COVERAGE_CACHE[key_b] = (0.0, {"project_id": pid_b})

    invalidate_item_embedding_coverage_cache(pid_a)

    assert key_a not in mod._ITEM_COVERAGE_CACHE
    assert key_b in mod._ITEM_COVERAGE_CACHE


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._probe_item_coverage_in_collections")
@patch("app.services.reindex_service.expected_coverage_item_ids")
@patch("app.services.reindex_service.collection_name_for", return_value="proj_test__mistral__mistral_embed")
@patch(
    "app.services.reindex_service.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_get_item_embedding_coverage_flags_missing(
    _resolve,
    _collection_name,
    mock_expected,
    mock_probe,
    _saved,
):
    project_id = uuid.uuid4()
    doc_id = str(uuid.uuid4())
    crawl_id = str(uuid.uuid4())
    active_collection = "proj_test__mistral__mistral_embed"

    mock_expected.return_value = ({doc_id, crawl_id}, {doc_id}, {crawl_id}, 1)
    mock_probe.return_value = {
        doc_id: {
            "rag_collection": {
                "provider": "ollama",
                "model": "jina/jina-embeddings-v2-base-de",
                "collection": "rag_collection",
            }
        }
    }

    db = MagicMock()
    result = get_item_embedding_coverage(db, project_id, source="chat")

    assert result["project_id"] == str(project_id)
    assert result["source"] == "chat"
    assert result["active_provider"] == "mistral"
    assert result["active_model"] == "mistral-embed"
    assert result["active_collection"] == active_collection

    doc_entry = result["documents"][0]
    assert doc_entry["id"] == doc_id
    assert doc_entry["missing_active"] is True
    assert doc_entry["embedded_models"][0]["is_active"] is False

    crawl_entry = result["crawl_sources"][0]
    assert crawl_entry["id"] == crawl_id
    assert crawl_entry["missing_active"] is True
    assert crawl_entry["embedded_models"] == []

    mock_probe.assert_called_once()
    assert mock_probe.call_args.args[1] == [active_collection]


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._probe_item_coverage_in_collections")
@patch("app.services.reindex_service.expected_coverage_item_ids")
@patch("app.services.reindex_service.collection_name_for", return_value="proj_test__mistral__mistral_embed")
@patch(
    "app.services.reindex_service.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_get_item_embedding_coverage_uses_cache(
    _resolve,
    _collection_name,
    mock_expected,
    mock_probe,
    _saved,
):
    project_id = uuid.uuid4()
    doc_id = str(uuid.uuid4())
    active_collection = "proj_test__mistral__mistral_embed"
    mock_expected.return_value = ({doc_id}, {doc_id}, set(), 1)
    mock_probe.return_value = {
        doc_id: {
            active_collection: {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": active_collection,
            }
        }
    }

    db = MagicMock()
    first = get_item_embedding_coverage(db, project_id, source="chat")
    second = get_item_embedding_coverage(db, project_id, source="chat")

    assert first == second
    mock_expected.assert_called_once()
    mock_probe.assert_called_once()


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._probe_item_coverage_in_collections", return_value={})
@patch("app.services.reindex_service.expected_coverage_item_ids")
@patch("app.services.reindex_service.collection_name_for", return_value="proj_test__mistral__mistral_embed")
@patch(
    "app.services.reindex_service.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_get_item_embedding_coverage_skip_cache(
    _resolve,
    _collection_name,
    mock_expected,
    mock_probe,
    _saved,
):
    project_id = uuid.uuid4()
    doc_id = str(uuid.uuid4())
    mock_expected.return_value = ({doc_id}, {doc_id}, set(), 1)

    db = MagicMock()
    get_item_embedding_coverage(db, project_id, source="chat")
    get_item_embedding_coverage(db, project_id, source="chat", skip_cache=True)

    assert mock_expected.call_count == 2
    assert mock_probe.call_count == 2


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._scan_item_collection_index")
@patch("app.services.reindex_service._probe_item_coverage_in_collections")
@patch("app.services.reindex_service.expected_coverage_item_ids")
@patch("app.services.reindex_service.collection_name_for", return_value="proj_test__mistral__mistral_embed")
@patch(
    "app.services.reindex_service.resolve_for_project",
    return_value=("mistral", "mistral-embed", "key"),
)
def test_get_item_embedding_coverage_never_full_scans_all_collections(
    _resolve,
    _collection_name,
    mock_expected,
    mock_probe,
    mock_scan,
    _saved,
):
    """Large crawl UIs must not walk every chunk metadata row across all collections."""
    project_id = uuid.uuid4()
    crawl_id = str(uuid.uuid4())
    mock_expected.return_value = ({crawl_id}, set(), {crawl_id}, 5000)
    mock_probe.return_value = {
        crawl_id: {
            "proj_test__mistral__mistral_embed": {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": "proj_test__mistral__mistral_embed",
            }
        }
    }

    db = MagicMock()
    result = get_item_embedding_coverage(db, project_id, source="chat")

    assert result["crawl_sources"][0]["missing_active"] is False
    mock_probe.assert_called_once()
    mock_scan.assert_not_called()
