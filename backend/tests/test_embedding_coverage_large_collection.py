"""Coverage checks must work when Chroma has tens of thousands of chunks."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.reindex_service import (
    _item_embedded_in_collection,
    assess_embedding_coverage,
    document_ids_in_active_collection,
)


@patch("app.services.reindex_service.get_pipeline")
def test_item_embedded_in_collection_uses_limit_one_get(mock_pipeline):
    crawl_id = str(uuid.uuid4())
    mock_coll = MagicMock()
    mock_coll.get.side_effect = [
        {"ids": []},
        {"ids": ["chunk-1"]},
    ]
    mock_pipeline.return_value.vdb.get_collection.return_value = mock_coll

    assert _item_embedded_in_collection("proj-1", "test_coll", crawl_id) is True
    assert mock_coll.get.call_count == 2


@patch("app.services.reindex_service._item_embedded_in_collection")
def test_document_ids_uses_candidate_lookup_when_small_set(mock_item):
    project_id = str(uuid.uuid4())
    candidates = {str(uuid.uuid4()), str(uuid.uuid4())}

    def _present(pid, coll, item_id):
        return item_id == next(iter(candidates))

    mock_item.side_effect = _present

    out = document_ids_in_active_collection(
        project_id, "test_coll", candidate_ids=candidates
    )
    assert out == {next(iter(candidates))}
    assert mock_item.call_count == 2


@patch("app.services.reindex_service._scan_item_collection_index")
def test_embedded_models_uses_batch_scan_with_many_collections(mock_scan):
    project_id = str(uuid.uuid4())
    candidates = {str(uuid.uuid4())}
    mock_scan.return_value = {
        next(iter(candidates)): {
            "coll-a": {
                "provider": "mistral",
                "model": "mistral-embed",
                "collection": "coll-a",
            }
        }
    }

    with patch("app.services.reindex_service.get_pipeline") as mock_pipeline:
        mock_pipeline.return_value.vdb.list_known_collections.return_value = [
            "coll-a",
            "coll-b",
            "coll-c",
        ]
        from app.services.reindex_service import embedded_models_by_item_id

        out = embedded_models_by_item_id(project_id, candidate_ids=candidates)

    assert next(iter(candidates)) in out
    mock_scan.assert_called_once()


@patch("app.services.reindex_service._saved_collection_for_source", return_value=None)
@patch("app.services.reindex_service._embedded_coverage_ids")
@patch("app.services.reindex_service.expected_coverage_item_ids")
def test_assess_coverage_passes_expected_ids_to_lookup(
    mock_expected, mock_embedded, _mock_saved
):
    project_id = uuid.uuid4()
    item_a = str(uuid.uuid4())
    mock_expected.return_value = ({item_a}, set(), set(), 1)
    mock_embedded.return_value = {item_a}

    db = MagicMock()
    report = assess_embedding_coverage(db, project_id, "test_coll", source="chat")

    assert report.needs_reindex is False
    assert report.coverage_items_embedded == 1
    mock_embedded.assert_called_once()
    assert mock_embedded.call_args.kwargs.get("candidate_ids") == {item_a}
