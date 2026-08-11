"""Reindex should propagate embedding rate limits and sync document status."""
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.services.embed_rate_limit import EmbeddingRateLimitError
from app.services.reindex_service import (
    _sync_uploaded_document_after_reindex,
    _uploaded_document_bytes,
    process_reindex_payload,
)


def test_uploaded_document_bytes_handles_memoryview():
    doc = SimpleNamespace(text_content=memoryview(b"%PDF-1.4 data"))
    assert _uploaded_document_bytes(doc).startswith(b"%PDF")


def test_sync_uploaded_document_marks_indexed_on_success():
    doc = SimpleNamespace(status="Queued", chunks=0, indexed_at=None)
    _sync_uploaded_document_after_reindex(
        MagicMock(),
        doc,
        {"chunks": 3, "status": "Indexed"},
    )
    assert doc.status == "Indexed"
    assert doc.chunks == 3


def test_sync_uploaded_document_keeps_indexing_on_rate_limit():
    doc = SimpleNamespace(status="Indexing", chunks=0, indexed_at=None)
    _sync_uploaded_document_after_reindex(
        MagicMock(),
        doc,
        {},
        exc=EmbeddingRateLimitError("429"),
    )
    assert doc.status == "Indexing"


def test_sync_marks_failed_when_never_successfully_indexed():
    doc = SimpleNamespace(status="Queued", chunks=0, indexed_at=None)
    _sync_uploaded_document_after_reindex(
        MagicMock(),
        doc,
        {},
        exc=RuntimeError("boom"),
    )
    assert doc.status == "Indexing Failed"
    assert doc.chunks == 0


def test_process_reindex_payload_reraises_rate_limit(monkeypatch):
    doc = SimpleNamespace(
        id="00000000-0000-0000-0000-000000000099",
        status="Queued",
        chunks=0,
        indexed_at=None,
        user_id=1,
        project_id="00000000-0000-0000-0000-000000000001",
        text_content=b"%PDF-1.4",
        title="x.pdf",
        type="application/pdf",
    )

    class _Q:
        def filter(self, *a, **k):
            return self

        def first(self):
            return doc

    db = MagicMock()
    db.query.return_value = _Q()

    monkeypatch.setattr("app.services.reindex_service.SessionLocal", lambda: db)
    monkeypatch.setattr(
        "app.services.reindex_service.resolve_for_project",
        lambda *a, **k: ("mistral", "mistral-embed", "key"),
    )
    monkeypatch.setattr(
        "app.services.reindex_service.reindex_uploaded_document",
        lambda *a, **k: (_ for _ in ()).throw(EmbeddingRateLimitError("429")),
    )

    with pytest.raises(EmbeddingRateLimitError):
        process_reindex_payload(
            {
                "project_id": "00000000-0000-0000-0000-000000000001",
                "source": "search",
                "run_id": "run-1",
                "phase": "upload",
                "document_ids": ["00000000-0000-0000-0000-000000000099"],
            }
        )
