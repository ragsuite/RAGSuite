"""Reindex temp path and chat answer honesty helpers."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.paths import backend_root, data_tmp_dir
from app.routes.rag import (
    CHAT_NO_SOURCES_DISCLAIMER,
    RAG_OOC_SENTINEL,
    RAG_OUT_OF_CONTEXT_MSG,
    _finalize_chat_answer_for_user,
)
from app.services.reindex_service import (
    _sync_uploaded_document_after_reindex,
    reindex_uploaded_document,
)


def test_data_tmp_dir_is_under_backend_root():
    root = backend_root()
    tmp = data_tmp_dir()
    assert tmp.is_dir()
    assert tmp.resolve().is_relative_to(root.resolve())


@patch("app.services.reindex_service._probe_embedding_credentials", return_value=None)
@patch("app.services.reindex_service.locked_ingest")
@patch("app.services.reindex_service.collection_name_for", return_value="test_coll")
def test_reindex_uses_absolute_unique_temp_path(_coll, mock_ingest, _probe):
    mock_ingest.return_value = {"status": "Indexed", "chunks": 2}
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.project_id = uuid.uuid4()
    doc.user_id = 1
    doc.title = "Sample.pdf"
    doc.text_content = b"%PDF-1.4 fake"
    doc.type = "application/pdf"

    seen_paths: list[str] = []

    def _capture(path, **kwargs):
        seen_paths.append(path)
        return {"status": "Indexed", "chunks": 1}

    mock_ingest.side_effect = _capture

    reindex_uploaded_document(doc, "mistral", "mistral-embed", "key")
    reindex_uploaded_document(doc, "mistral", "mistral-embed", "key")

    assert len(seen_paths) == 2
    for p in seen_paths:
        assert p.startswith(str(data_tmp_dir().resolve()))
    assert seen_paths[0] != seen_paths[1]


@patch("app.services.reindex_service._probe_embedding_credentials", return_value=None)
@patch("app.services.reindex_service.locked_ingest")
def test_reindex_does_not_pre_delete_before_ingest(mock_ingest, _probe):
    """Regression: pre-delete wiped Indexed docs when prepare later returned 0 chunks."""
    mock_ingest.return_value = {"status": "Indexed", "chunks": 1}
    doc = MagicMock()
    doc.id = uuid.uuid4()
    doc.project_id = uuid.uuid4()
    doc.user_id = 1
    doc.title = "Sample.pdf"
    doc.text_content = b"%PDF-1.4 fake"
    doc.type = "application/pdf"

    with patch(
        "app.services.reindex_service.locked_delete_document_embeddings"
    ) as mock_delete:
        reindex_uploaded_document(doc, "mistral", "mistral-embed", "key")
        mock_delete.assert_not_called()
    mock_ingest.assert_called_once()


def test_sync_preserves_indexed_when_vectors_preserved():
    doc = SimpleNamespace(status="Indexed", chunks=12, indexed_at=None)
    _sync_uploaded_document_after_reindex(
        MagicMock(),
        doc,
        {"chunks": 0, "status": "No text extracted", "vectors_preserved": True},
    )
    assert doc.status == "Indexed"
    assert doc.chunks == 12


def test_sync_preserves_indexed_on_exception_after_good_index():
    doc = SimpleNamespace(status="Indexed", chunks=7, indexed_at=None)
    _sync_uploaded_document_after_reindex(
        MagicMock(),
        doc,
        {},
        exc=RuntimeError("embed failed"),
    )
    assert doc.status == "Indexed"
    assert doc.chunks == 7


def test_finalize_chat_replaces_ooc_sentinel():
    out = _finalize_chat_answer_for_user(RAG_OOC_SENTINEL, None, raw_llm=RAG_OOC_SENTINEL)
    assert out == RAG_OUT_OF_CONTEXT_MSG
    assert CHAT_NO_SOURCES_DISCLAIMER not in (out or "")


def test_finalize_chat_refuses_ungrounded_answer_without_sources():
    answer = "Here is a detailed answer about widgets."
    out = _finalize_chat_answer_for_user(answer, None)
    assert out == RAG_OUT_OF_CONTEXT_MSG
    assert CHAT_NO_SOURCES_DISCLAIMER not in (out or "")


def test_finalize_chat_keeps_answer_when_sources_present():
    answer = "Grounded answer."
    sources = [{"title": "doc.pdf", "url": "/api/v1/documents/x/content"}]
    out = _finalize_chat_answer_for_user(
        answer,
        sources,
        user_query="What is in the document?",
    )
    assert out == answer
