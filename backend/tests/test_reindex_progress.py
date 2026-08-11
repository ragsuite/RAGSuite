"""Reindex progress accounting when ingest produces zero chunks."""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

from app.services.reindex_service import (
    _apply_crawl_result_to_progress,
    _apply_upload_result_to_progress,
)


@patch("app.services.reindex_service.add_reindex_progress")
def test_apply_upload_zero_chunks_counts_as_failed(mock_add):
    db = MagicMock()
    project_uuid = uuid.uuid4()

    _apply_upload_result_to_progress(
        db,
        project_uuid,
        "chat",
        {"status": "No chunks indexed", "chunks": 0},
        None,
    )

    mock_add.assert_called_once_with(
        db,
        project_uuid,
        "chat",
        failed_delta=1,
        error="No chunks indexed",
    )


@patch("app.services.reindex_service.add_reindex_progress")
def test_apply_crawl_zero_chunks_counts_as_failed(mock_add):
    db = MagicMock()
    project_uuid = uuid.uuid4()

    _apply_crawl_result_to_progress(db, project_uuid, "chat", doc_count=12, chunks=0, error=None)

    mock_add.assert_called_once_with(
        db,
        project_uuid,
        "chat",
        failed_delta=1,
        error="No chunks indexed",
    )


@patch("app.services.reindex_service.add_reindex_progress")
def test_apply_crawl_success_counts_embedded(mock_add):
    db = MagicMock()
    project_uuid = uuid.uuid4()

    _apply_crawl_result_to_progress(db, project_uuid, "chat", doc_count=12, chunks=40, error=None)

    mock_add.assert_called_once_with(
        db,
        project_uuid,
        "chat",
        embedded_delta=1,
    )
