"""POST /documents/train retrains each document with its own AI model; Text/Q&A keep their pin."""
from __future__ import annotations

import asyncio
import hashlib
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.platform.module_bootstrap import ensure_ragsuite_modules_path
from app.services.textual_sources import NOT_TRAINED_STATUS, TEXT_MIME, TEXT_SOURCE_LABEL

ensure_ragsuite_modules_path()

from ragsuite_modules.documents.backend import textual_sources as svc  # noqa: E402
from ragsuite_modules.documents.backend import training_routes as routes  # noqa: E402
from ragsuite_modules.documents.backend.upload_helpers import IngestOutcome  # noqa: E402

USER = SimpleNamespace(id=7)


def _doc(status: str = "Indexed", **overrides):
    content = b"Refunds within 14 days"
    base = dict(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        title="Policy",
        description=None,
        language="en",
        type=TEXT_MIME,
        source=TEXT_SOURCE_LABEL,
        text_content=content,
        checksum=hashlib.sha256(content).hexdigest()[:12],
        status=status,
        chunks=3,
        ingest_embedding_target="openai",
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _db_with(docs):
    db = MagicMock()
    db.query.return_value.filter.return_value.all.return_value = docs
    db.query.return_value.filter.return_value.first.return_value = docs[0] if docs else None
    return db


def _train(db, ids):
    body = routes.DocumentTrainIn(document_ids=ids)
    return asyncio.run(routes.train_documents(body, MagicMock(), db=db, current_user=USER))


@pytest.fixture(autouse=True)
def _no_audit():
    with patch.object(routes, "emit_audit"), patch.object(svc, "emit_audit"):
        yield


def test_train_reports_started_busy_and_rejected_documents():
    ok, busy, bad = _doc(), _doc(status="Indexing"), _doc()

    async def fake_retrain(_db, _user, document):
        if document is bad:
            raise HTTPException(status_code=400, detail="This file type can't be retrained.")
        return IngestOutcome("Queued", 0, "queued", True)

    with patch.object(routes, "retrain_stored_document", new=fake_retrain):
        results = _train(_db_with([ok, busy, bad]), [ok.id, busy.id, bad.id])

    by_id = {r.id: r for r in results}
    assert by_id[str(ok.id)].started is True and by_id[str(ok.id)].status == "Queued"
    assert by_id[str(busy.id)].started is False and by_id[str(busy.id)].message == "Already training."
    assert by_id[str(bad.id)].started is False and "retrained" in by_id[str(bad.id)].message


def test_train_propagates_rate_limit():
    doc = _doc()
    retrain = AsyncMock(side_effect=HTTPException(status_code=429, detail="Too many"))
    with patch.object(routes, "retrain_stored_document", new=retrain):
        with pytest.raises(HTTPException) as exc:
            _train(_db_with([doc]), [doc.id])
    assert exc.value.status_code == 429


def test_train_404_when_no_owned_documents():
    with pytest.raises(HTTPException) as exc:
        _train(_db_with([]), [uuid.uuid4()])
    assert exc.value.status_code == 404


def test_textual_update_without_target_keeps_existing_pin():
    doc = _doc()
    body = svc.TextSourceIn(title="Policy", content="Refunds within 14 days")
    svc.update_textual_document(_db_with([doc]), MagicMock(), USER, str(doc.id), body, svc.text_payload(body))
    assert doc.ingest_embedding_target == "openai"
    assert doc.status == "Indexed"


def test_textual_update_with_new_model_needs_retraining():
    doc = _doc()
    body = svc.TextSourceIn(
        title="Policy", content="Refunds within 14 days", ingest_embedding_target="mistral"
    )
    with patch.object(svc, "parse_document_ingest_target", return_value="mistral"):
        svc.update_textual_document(_db_with([doc]), MagicMock(), USER, str(doc.id), body, svc.text_payload(body))
    assert doc.ingest_embedding_target == "mistral"
    assert doc.status == NOT_TRAINED_STATUS


def test_textual_create_rejects_unusable_model():
    body = svc.TextSourceIn(title="Policy", content="Refunds", ingest_embedding_target="gemini")
    with patch.object(svc, "resolve_upload_project_id", return_value=uuid.uuid4()), patch.object(
        svc, "parse_document_ingest_target", side_effect=ValueError("Add an API key first.")
    ):
        with pytest.raises(HTTPException) as exc:
            svc.create_textual_document(MagicMock(), MagicMock(), USER, body, svc.text_payload(body))
    assert exc.value.status_code == 400
