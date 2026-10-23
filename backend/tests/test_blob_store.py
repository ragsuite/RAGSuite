"""Unit tests for the MinIO blob helper (no live MinIO)."""
from __future__ import annotations

from app.platform.blob_store import blob_key


def test_blob_key_is_project_document_filename():
    assert blob_key("proj-1", "doc-2", "Report.PDF") == "proj-1/doc-2/Report.PDF"
    assert blob_key("p", "d", "../../etc/passwd") == "p/d/passwd"


def test_blob_store_health_without_endpoint(monkeypatch):
    from app.platform import blob_store
    from app.settings import settings

    monkeypatch.setattr(settings, "minio_endpoint", "")
    blob_store._client = None
    blob_store._bucket_ready = False
    report = blob_store.health()
    assert report["healthy"] is False
    assert "MINIO_ENDPOINT" in report["message"]
