"""Text / Q&A sources: saving never trains; training starts explicitly and drafts stay out of reindex."""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.platform.module_bootstrap import ensure_ragsuite_modules_path
from app.services.reindex_service import _document_has_reindexable_bytes
from app.services.textual_sources import (
    NOT_TRAINED_STATUS,
    TEXT_MIME,
    TEXT_SOURCE_LABEL,
    is_untrained_textual_draft,
)

ensure_ragsuite_modules_path()

from ragsuite_modules.documents.backend import textual_sources as svc  # noqa: E402
from ragsuite_modules.documents.backend.upload_helpers import IngestOutcome  # noqa: E402

DOC_ID = "11111111-1111-1111-1111-111111111111"
USER = SimpleNamespace(id=7)


def _db_returning(document):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = document
    return db


def _existing(**overrides):
    content = overrides.pop("content", b"Refunds within 14 days")
    base = dict(
        id=uuid.UUID(DOC_ID),
        project_id=uuid.uuid4(),
        title="Policy",
        description=None,
        language="en",
        type=TEXT_MIME,
        source=TEXT_SOURCE_LABEL,
        text_content=content,
        checksum=hashlib.sha256(content).hexdigest()[:12],
        status="Indexed",
        chunks=3,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


@pytest.fixture(autouse=True)
def _no_audit():
    with patch.object(svc, "emit_audit"):
        yield


def test_create_saves_not_trained_without_ingest():
    db = MagicMock()
    body = svc.TextSourceIn(title="Policy", content="Refunds within 14 days")
    with patch.object(svc, "resolve_upload_project_id", return_value=uuid.uuid4()), patch.object(
        svc, "run_document_ingest", new=AsyncMock()
    ) as ingest:
        response = svc.create_textual_document(db, MagicMock(), USER, body, svc.text_payload(body))
    saved = db.add.call_args.args[0]
    assert saved.status == NOT_TRAINED_STATUS and saved.chunks == 0
    assert saved.source == TEXT_SOURCE_LABEL and saved.type == TEXT_MIME
    assert response.status == NOT_TRAINED_STATUS
    ingest.assert_not_called()


def test_update_metadata_only_keeps_trained_status():
    doc = _existing()
    body = svc.TextSourceIn(title="Renamed", content="Refunds within 14 days", description="note")
    svc.update_textual_document(_db_returning(doc), MagicMock(), USER, DOC_ID, body, svc.text_payload(body))
    assert doc.title == "Renamed" and doc.description == "note"
    assert doc.status == "Indexed" and doc.chunks == 3


def test_update_content_marks_needs_retraining_and_keeps_vectors():
    doc = _existing()
    body = svc.TextSourceIn(title="Policy", content="Refunds within 30 days")
    svc.update_textual_document(_db_returning(doc), MagicMock(), USER, DOC_ID, body, svc.text_payload(body))
    assert doc.status == NOT_TRAINED_STATUS
    assert doc.chunks == 3
    assert doc.text_content == b"Refunds within 30 days"


def test_update_refuses_while_training():
    body = svc.TextSourceIn(title="Policy", content="Refunds")
    with pytest.raises(HTTPException) as exc:
        svc.update_textual_document(
            _db_returning(_existing(status="Indexing")), MagicMock(), USER, DOC_ID, body, svc.text_payload(body)
        )
    assert exc.value.status_code == 409


def test_train_rejects_missing_or_busy_sources():
    with pytest.raises(HTTPException) as missing:
        asyncio.run(svc.train_textual_document(_db_returning(None), MagicMock(), USER, DOC_ID, TEXT_SOURCE_LABEL))
    assert missing.value.status_code == 404
    with pytest.raises(HTTPException) as busy:
        asyncio.run(
            svc.train_textual_document(
                _db_returning(_existing(status="Queued")), MagicMock(), USER, DOC_ID, TEXT_SOURCE_LABEL
            )
        )
    assert busy.value.status_code == 409


def test_train_queues_ingest_from_stored_content(tmp_path):
    doc = _existing(status=NOT_TRAINED_STATUS, chunks=0)
    staging = tmp_path / "doc.rstext"
    seen_status = {}

    async def fake_ingest(db, *, document, save_path, **_kwargs):
        seen_status["value"] = document.status
        assert open(save_path, "rb").read() == b"Refunds within 14 days"
        return IngestOutcome("Queued", 0, "queued", True)

    with patch.object(svc, "prepare_ingest_dirs", return_value=True), patch.object(
        svc, "enforce_ingest_queue_caps"
    ), patch.object(svc, "ingest_save_path", return_value=str(staging)), patch.object(
        svc, "run_document_ingest", new=fake_ingest
    ):
        response = asyncio.run(
            svc.train_textual_document(_db_returning(doc), MagicMock(), USER, DOC_ID, TEXT_SOURCE_LABEL)
        )
    assert seen_status["value"] == "Queued"
    assert response.status == "Queued"
    assert staging.exists()


def test_untrained_drafts_are_skipped_by_project_reindex():
    assert is_untrained_textual_draft(NOT_TRAINED_STATUS, 0)
    assert not is_untrained_textual_draft(NOT_TRAINED_STATUS, 4)
    assert not is_untrained_textual_draft("Indexed", 0)
    draft = _existing(status=NOT_TRAINED_STATUS, chunks=0)
    edited = _existing(status=NOT_TRAINED_STATUS, chunks=4)
    assert _document_has_reindexable_bytes(draft) is False
    assert _document_has_reindexable_bytes(edited) is True
