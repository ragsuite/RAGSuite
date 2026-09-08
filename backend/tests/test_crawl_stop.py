"""Stop Crawl cancel helper + trained_at clear on destination change."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.models import BackgroundJob, CrawlJob, CrawlJobStatus
from app.routes.crawl import (
    _cancel_active_crawl_work_for_source,
    _should_clear_trained_at_for_ingest_target_change,
)
from app.services.crawler import crawl_job_should_skip_indexing


def test_clear_trained_at_on_null_to_chat_when_new_collection_empty():
    trained_at = datetime.now(timezone.utc)
    assert _should_clear_trained_at_for_ingest_target_change(
        trained_at,
        None,
        "chat",
        has_target_vectors=False,
    )
    assert _should_clear_trained_at_for_ingest_target_change(
        trained_at,
        "",
        "chat",
        has_target_vectors=False,
    )


def test_keep_trained_at_when_new_collection_already_has_vectors():
    trained_at = datetime.now(timezone.utc)
    assert not _should_clear_trained_at_for_ingest_target_change(
        trained_at,
        None,
        "chat",
        has_target_vectors=True,
    )


def test_keep_trained_at_when_surface_unchanged():
    trained_at = datetime.now(timezone.utc)
    assert not _should_clear_trained_at_for_ingest_target_change(
        trained_at,
        "chat",
        "chat",
        has_target_vectors=False,
    )


def test_cancelled_job_skips_indexing():
    assert crawl_job_should_skip_indexing(CrawlJobStatus.CANCELLED)
    assert not crawl_job_should_skip_indexing(CrawlJobStatus.RUNNING)
    assert not crawl_job_should_skip_indexing(CrawlJobStatus.INDEXING)


def test_cancel_active_crawl_marks_jobs_without_deleting_source():
    source_id = uuid.uuid4()
    job = SimpleNamespace(
        id=uuid.uuid4(),
        source_id=source_id,
        status=CrawlJobStatus.RUNNING,
        finished_at=None,
    )
    db = MagicMock()

    def query(model):
        q = MagicMock()
        if model is CrawlJob:
            q.filter.return_value.all.return_value = [job]
            return q
        if model is BackgroundJob:
            # Matching CRAWL/CRAWL_FETCH lookup uses .first(); ingest uses .all()
            q.filter.return_value.first.return_value = None
            q.filter.return_value.all.return_value = []
            return q
        return q

    db.query.side_effect = query

    with patch(
        "app.routes.crawl.request_crawl_cancel",
        create=True,
    ):
        # request_crawl_cancel is imported inside the helper from services.crawler
        with patch("app.services.crawler.request_crawl_cancel") as mock_cancel:
            crawl_count, ingest_count = _cancel_active_crawl_work_for_source(
                db,
                source_id,
                reason="Cancelled: crawl stopped by user",
            )

    assert crawl_count == 1
    assert ingest_count == 0
    assert job.status == CrawlJobStatus.CANCELLED
    assert job.finished_at is not None
    db.commit.assert_called_once()
    mock_cancel.assert_called_once_with(str(source_id))
    db.delete.assert_not_called()
