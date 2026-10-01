"""Per-document AI model pin: validation, ingest targets, and collection scoping."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.services import document_embedding_target as det
from app.services.rag.embedding_resolver import IngestEmbeddingTarget

PROJECT = uuid.uuid4()


def _target(provider: str, collection: str) -> IngestEmbeddingTarget:
    return IngestEmbeddingTarget(
        source=None, provider=provider, model=f"{provider}-embed", api_key="k", collection=collection
    )


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("OpenAI ", "openai"), ("mistral", "mistral"), ("jina", None), ("", None), (None, None)],
)
def test_normalize_document_ingest_target(raw, expected):
    assert det.normalize_document_ingest_target(raw) == expected


def test_parse_empty_means_no_pin():
    assert det.parse_document_ingest_target(MagicMock(), PROJECT, "  ") is None


def test_parse_rejects_unknown_provider():
    with pytest.raises(ValueError):
        det.parse_document_ingest_target(MagicMock(), PROJECT, "jina")


def test_parse_rejects_provider_without_working_key():
    with patch.object(det, "provider_target_selection_error", return_value="Add an API key first."):
        with pytest.raises(ValueError, match="Add an API key first."):
            det.parse_document_ingest_target(MagicMock(), PROJECT, "gemini")


def test_parse_accepts_usable_provider():
    with patch.object(det, "provider_target_selection_error", return_value=None):
        assert det.parse_document_ingest_target(MagicMock(), PROJECT, "Mistral") == "mistral"


def test_unpinned_document_trains_into_every_surface_collection():
    surfaces = [_target("openai", "c_search"), _target("mistral", "c_chat")]
    with patch.object(det.embedding_resolver, "resolve_upload_ingest_targets", return_value=surfaces):
        assert det.document_ingest_targets(MagicMock(), PROJECT, None) == surfaces


def test_pinned_document_trains_only_into_its_provider():
    pinned = _target("gemini", "c_gemini")
    with patch.object(det, "resolve_provider_ingest_target", return_value=pinned) as resolve, patch.object(
        det.embedding_resolver, "resolve_upload_ingest_targets"
    ) as upload_targets:
        assert det.document_ingest_targets(MagicMock(), PROJECT, "gemini") == [pinned]
    assert resolve.call_args.args[2] == "gemini"
    upload_targets.assert_not_called()


def test_pinned_document_with_unusable_provider_has_no_targets():
    with patch.object(det, "resolve_provider_ingest_target", return_value=None):
        assert det.document_ingest_targets(MagicMock(), PROJECT, "ollama") == []


def test_expected_ids_keep_unpinned_and_matching_pins_only():
    pins = {"pinned-search": "c_search", "pinned-other": "c_gemini", "pinned-broken": None}
    ids = ["legacy", "pinned-search", "pinned-other", "pinned-broken"]
    with patch.object(det, "pinned_document_collections", return_value=pins):
        assert det.uploaded_ids_expected_for_collection(MagicMock(), PROJECT, "c_search", ids) == {
            "legacy",
            "pinned-search",
        }
        assert det.uploaded_ids_expected_for_collection(MagicMock(), PROJECT, "c_gemini", ids) == {
            "legacy",
            "pinned-other",
        }


def test_expected_ids_skip_lookup_when_empty():
    with patch.object(det, "pinned_document_collections") as pins:
        assert det.uploaded_ids_expected_for_collection(MagicMock(), PROJECT, "c", []) == set()
    pins.assert_not_called()


def test_purge_skips_unpinned_documents():
    with patch.object(det, "stored_document_ingest_target", return_value=None), patch(
        "app.services.rag.singleton.locked_delete_document_embeddings"
    ) as delete:
        det.purge_stale_document_embedding_collections(MagicMock(), uuid.uuid4(), [_target("openai", "c")])
    delete.assert_not_called()


def test_purge_drops_only_collections_no_longer_targeted():
    doc_id = uuid.uuid4()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = (PROJECT,)
    embedded = {str(doc_id): [{"collection": "c_old"}, {"collection": "c_new"}]}
    with patch.object(det, "stored_document_ingest_target", return_value="mistral"), patch(
        "app.services.reindex_service.embedded_models_by_item_id", return_value=embedded
    ), patch("app.services.rag.singleton.locked_delete_document_embeddings") as delete:
        det.purge_stale_document_embedding_collections(db, doc_id, [_target("mistral", "c_new")])
    delete.assert_called_once_with(str(doc_id), collection_name="c_old")
