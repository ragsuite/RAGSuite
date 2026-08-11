"""Document ingest orchestration: queue vs inline."""
from unittest.mock import MagicMock, patch
import uuid

import pytest
from fastapi import HTTPException

from app.services.document_ingest_orchestration import (
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
