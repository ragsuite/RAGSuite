"""Tests for crawl ingest progress helpers."""
import uuid

from app.services.crawl_ingest_helpers import (
    crawl_status_message_from_job,
    get_indexing_progress,
    init_indexing_progress,
    set_indexing_wait,
)
from app.models import CrawlJob, CrawlJobStatus


def test_init_indexing_progress():
    errors = init_indexing_progress([{"type": "crawl_diagnostics", "failed_count": 0}], 4)
    progress = get_indexing_progress(errors)
    assert progress is not None
    assert progress["batches_total"] == 4
    assert progress["completed_batches"] == []


def test_set_indexing_wait_message():
    errors = set_indexing_wait([], "Waiting for embedding service — will continue automatically.")
    assert any(e.get("type") == "indexing_wait" for e in errors)


def test_crawl_status_message_indexing_wait():
    job = CrawlJob(
        source_id=uuid.uuid4(),
        status=CrawlJobStatus.INDEXING,
        errors=set_indexing_wait([], "Waiting for embedding service — will continue automatically."),
    )
    msg = crawl_status_message_from_job(job)
    assert "Waiting for embedding service" in msg


def test_crawl_progress_percentage_indexing_batches():
    from app.services.crawl_ingest_helpers import crawl_progress_percentage

    job = CrawlJob(
        source_id=uuid.uuid4(),
        status=CrawlJobStatus.INDEXING,
        errors=init_indexing_progress([], 4),
    )
    # 0/4 batches → 85%
    assert crawl_progress_percentage(job) == 85.0

    progress = get_indexing_progress(job.errors)
    assert progress is not None
    progress["completed_batches"] = [0, 1]
    job.errors = [progress]
    # 2/4 → 85 + 7 = 92
    assert crawl_progress_percentage(job) == 92.0

    done = CrawlJob(source_id=uuid.uuid4(), status=CrawlJobStatus.COMPLETED)
    assert crawl_progress_percentage(done) == 100.0


def test_crawl_progress_percentage_running_leaves_headroom():
    from app.services.crawl_ingest_helpers import crawl_progress_percentage

    job = CrawlJob(
        source_id=uuid.uuid4(),
        status=CrawlJobStatus.RUNNING,
        pages_fetched=5000,
    )
    assert crawl_progress_percentage(job, max_pages=5000) == 85.0
