"""Coverage counts vectors in saved settings collection when resolver falls back."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.reindex_service import (
    _saved_collection_for_source,
    assess_embedding_coverage,
    chroma_index_readiness,
)


@patch("app.services.reindex_service._read_chatbot_settings")
@patch("app.services.reindex_service.collection_name_for")
@patch("app.services.reindex_service._normalize_provider", return_value="openai")
def test_saved_collection_uses_db_model(mock_norm, mock_coll, mock_chat):
    project_id = uuid.uuid4()
    row = MagicMock()
    row.model_provider = "openai"
    row.embedding_model = "text-embedding-3-large"
    mock_chat.return_value = row
    mock_coll.return_value = "proj_saved_openai"

    db = MagicMock()
    coll = _saved_collection_for_source(db, project_id, "chat")
    assert coll == "proj_saved_openai"


@patch("app.services.reindex_service._embedded_coverage_ids")
@patch("app.services.crawl_source_embedding.crawl_source_ids_expected_for_surface")
@patch("app.services.reindex_service.expected_coverage_item_ids")
@patch("app.services.reindex_service._saved_collection_for_source")
def test_assess_coverage_checks_saved_collection_when_different(
    mock_saved_coll, mock_expected, mock_scoped, mock_embedded
):
    project_id = uuid.uuid4()
    item_a, item_b = str(uuid.uuid4()), str(uuid.uuid4())
    mock_expected.return_value = ({item_a, item_b}, {item_a}, {item_b}, 2)
    mock_scoped.return_value = {item_b}
    mock_saved_coll.return_value = "proj_saved_openai"
    mock_embedded.return_value = {item_a, item_b}

    db = MagicMock()
    report = assess_embedding_coverage(
        db, project_id, "rag_collection", source="chat"
    )
    assert report.coverage_items_embedded == 2
    assert report.needs_reindex is False
    mock_embedded.assert_called_once()
    assert mock_embedded.call_args.kwargs.get("candidate_ids") == {item_a, item_b}


@patch("app.services.reindex_service.get_pipeline", return_value=None)
def test_chroma_index_readiness_when_pipeline_missing(mock_pipe):
    ready, err = chroma_index_readiness()
    assert ready is False
    assert err
