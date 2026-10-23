"""Document ingest orchestration: queue vs inline."""
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
import uuid

import pytest
from fastapi import HTTPException

from app.services.document_ingest_orchestration import (
    _ingest_kwargs_for_target,
    queue_document_ingest,
    use_async_document_ingest,
)


@pytest.fixture
def mock_db():
    return MagicMock()


def test_use_async_requires_durable_jobs():
    with patch("app.services.document_ingest_orchestration.settings") as mock_settings:
        mock_settings.enable_durable_jobs = False
        mock_settings.enable_async_document_ingest = True
        assert use_async_document_ingest() is False

        mock_settings.enable_durable_jobs = True
        mock_settings.enable_async_document_ingest = False
        assert use_async_document_ingest() is False

        mock_settings.enable_async_document_ingest = True
        assert use_async_document_ingest() is True


def test_queue_document_ingest_enqueues(mock_db):
    document_id = uuid.uuid4()
    project_id = uuid.uuid4()
    row = MagicMock()
    row.storage_key = None
    mock_db.query.return_value.filter.return_value.first.return_value = row

    with patch("app.services.document_ingest_orchestration.settings") as mock_settings:
        mock_settings.enable_durable_jobs = True
        with patch(
            "app.services.job_queue.enqueue_document_ingest",
            return_value=True,
        ) as mock_enqueue:
            with patch(
                "app.services.job_queue.worker_is_running",
                return_value=True,
            ):
                result = queue_document_ingest(
                    mock_db,
                    document_id=document_id,
                    staging_path="data/staging/x.pdf",
                    user_id=1,
                    project_id=project_id,
                    title="Test.pdf",
                )

    assert result.async_queued is True
    assert result.doc_status == "Queued"
    mock_enqueue.assert_called_once_with(
        str(document_id),
        "data/staging/x.pdf",
        user_id=1,
        project_id=project_id,
        storage_key=None,
    )


def test_queue_raises_503_when_enqueue_fails(mock_db):
    document_id = uuid.uuid4()
    doc = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = doc

    with patch(
        "app.services.job_queue.enqueue_document_ingest",
        return_value=False,
    ):
        with pytest.raises(HTTPException) as exc:
            queue_document_ingest(
                mock_db,
                document_id=document_id,
                staging_path="data/staging/x.pdf",
                user_id=1,
                project_id=uuid.uuid4(),
                title="Test.pdf",
            )
        assert exc.value.status_code == 503
        assert doc.status == "Indexing Failed"


def test_ingest_kwargs_include_pdf_options_from_document_meta(mock_db):
    document_id = uuid.uuid4()
    project_id = uuid.uuid4()
    uploaded = SimpleNamespace(
        meta_data={"pdf_page_from": 3, "pdf_page_to": 20, "pdf_strip_chrome": True}
    )
    project = SimpleNamespace(enhance_index=None)

    def _get(model, key):
        name = getattr(model, "__name__", "")
        if name == "UploadedDocument" and key == document_id:
            return uploaded
        if name == "Project" and key == project_id:
            return project
        return None

    mock_db.get.side_effect = _get
    target = SimpleNamespace(
        provider="openai",
        model="text-embedding-3-small",
        api_key="sk",
        endpoint=None,
        api_version=None,
    )

    kwargs = _ingest_kwargs_for_target(
        db=mock_db,
        save_path="data/staging/manual.pdf",
        document_id=str(document_id),
        user_id=1,
        project_id=project_id,
        target=target,
    )

    assert kwargs["pdf_page_from"] == 3
    assert kwargs["pdf_page_to"] == 20
    assert kwargs["pdf_strip_chrome"] is True
    assert "extract_engine" not in kwargs


def test_ingest_kwargs_include_docling_engine_from_meta(mock_db):
    document_id = uuid.uuid4()
    project_id = uuid.uuid4()
    uploaded = SimpleNamespace(meta_data={"extract_engine": "docling"})
    project = SimpleNamespace(enhance_index=None)

    def _get(model, key):
        name = getattr(model, "__name__", "")
        if name == "UploadedDocument" and key == document_id:
            return uploaded
        if name == "Project" and key == project_id:
            return project
        return None

    mock_db.get.side_effect = _get
    target = SimpleNamespace(
        provider="openai",
        model="text-embedding-3-small",
        api_key="sk",
        endpoint=None,
        api_version=None,
    )

    kwargs = _ingest_kwargs_for_target(
        db=mock_db,
        save_path="data/staging/manual.pdf",
        document_id=str(document_id),
        user_id=1,
        project_id=project_id,
        target=target,
    )

    assert kwargs["extract_engine"] == "docling"


def test_ingest_kwargs_omit_pdf_options_when_meta_missing(mock_db):
    document_id = uuid.uuid4()
    project_id = uuid.uuid4()
    mock_db.get.return_value = SimpleNamespace(meta_data={}, enhance_index=None)
    target = SimpleNamespace(
        provider="openai",
        model="text-embedding-3-small",
        api_key="sk",
        endpoint=None,
        api_version=None,
    )

    kwargs = _ingest_kwargs_for_target(
        db=mock_db,
        save_path="data/staging/manual.pdf",
        document_id=str(document_id),
        user_id=1,
        project_id=project_id,
        target=target,
    )

    assert "pdf_page_from" not in kwargs
    assert "pdf_page_to" not in kwargs
    assert "pdf_strip_chrome" not in kwargs

