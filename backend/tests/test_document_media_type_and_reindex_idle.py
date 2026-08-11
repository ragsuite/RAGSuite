"""Document media-type normalization and orphaned reindex unlock."""
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.documents.backend.routes import _document_media_type  # noqa: E402
from app.services.reindex_service import (
    _document_has_reindexable_bytes,
    _uploaded_document_bytes,
    clear_orphaned_reindex_job_if_idle,
)


def test_document_media_type_maps_gmail_short_types():
    assert _document_media_type("txt") == "text/plain"
    assert _document_media_type("text/plain") == "text/plain"
    assert _document_media_type("pdf") == "application/pdf"
    assert _document_media_type(None) == "application/octet-stream"


def test_document_has_reindexable_bytes_keeps_pdf_intact():
    doc = SimpleNamespace(text_content=b"%PDF-1.4\n...\n", id="x")
    assert _document_has_reindexable_bytes(doc) is True
    assert _uploaded_document_bytes(doc).startswith(b"%PDF")


def test_clear_orphaned_reindex_job_if_idle(monkeypatch):
    calls = {}

    def _finalize(db, project_uuid, source, *, status=None, error=None):
        calls["status"] = status
        calls["error"] = error

    row = SimpleNamespace(status="running")

    class _Q:
        def filter(self, *a, **k):
            return self

        def count(self):
            return 0

        def first(self):
            return row

    db = MagicMock()
    db.query.return_value = _Q()

    monkeypatch.setattr(
        "app.services.reindex_service.read_reindex_job",
        lambda *a, **k: row,
    )
    monkeypatch.setattr(
        "app.services.reindex_service.finalize_reindex_job",
        _finalize,
    )

    cleared = clear_orphaned_reindex_job_if_idle(
        db,
        __import__("uuid").UUID("00000000-0000-0000-0000-000000000001"),
        "search",
    )
    assert cleared is True
    assert calls["status"] == "error"
