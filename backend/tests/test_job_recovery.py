"""Startup recovery must not relabel live crawl indexing as queued or pin DB connections."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
    Base,
    CrawlJob,
    CrawlJobStatus,
    CrawlSource,
    Organization,
    Project,
    User,
)
from app.services import job_queue


@pytest.fixture()
def recovery_db(monkeypatch):
    engine = create_engine(
        "sqlite://",
        poolclass=StaticPool,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    monkeypatch.setattr(job_queue, "SessionLocal", Session)
    monkeypatch.setattr("app.services.admission._redis", lambda: None)

    db = Session()
    org = Organization(name="Org", slug="org")
    db.add(org)
    db.flush()
    user = User(
        username="u",
        email="u@example.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.flush()
    project = Project(name="P", owner_id=user.id, org_id=org.id)
    db.add(project)
    db.flush()
    source = CrawlSource(
        id=uuid.uuid4(),
        name="Sitemap",
        base_url="https://example.com/sitemap.xml",
        depth=0,
        created_by_id=user.id,
        project_id=project.id,
        documents_count=0,
    )
    db.add(source)
    db.commit()
    yield Session, db, source
    db.close()


def _crawl_job(db, source, status):
    job = CrawlJob(
        id=uuid.uuid4(),
        source_id=source.id,
        status=status,
        pages_fetched=10,
        errors=[],
        queued_at=datetime.now(timezone.utc),
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    return job


def _ingest_batch(db, crawl_job, status, batch_index=0):
    bg = BackgroundJob(
        job_type=BackgroundJobType.CRAWL_INGEST_BATCH.value,
        status=status,
        payload={"crawl_job_id": str(crawl_job.id), "batch_index": batch_index},
        started_at=datetime.now(timezone.utc),
    )
    db.add(bg)
    db.commit()
    return bg


def test_restart_keeps_indexing_crawl_with_batches(recovery_db):
    Session, db, source = recovery_db
    indexing = _crawl_job(db, source, CrawlJobStatus.INDEXING)
    running_batch = _ingest_batch(db, indexing, BackgroundJobStatus.RUNNING.value)
    fetching = _crawl_job(db, source, CrawlJobStatus.RUNNING)

    job_queue.reset_running_crawl_jobs()

    check = Session()
    assert check.get(CrawlJob, indexing.id).status == CrawlJobStatus.INDEXING
    assert check.get(CrawlJob, fetching.id).status == CrawlJobStatus.PENDING
    assert check.get(BackgroundJob, running_batch.id).status == BackgroundJobStatus.PENDING.value
    check.close()


def test_restart_requeues_indexing_crawl_without_batches(recovery_db):
    Session, db, source = recovery_db
    indexing = _crawl_job(db, source, CrawlJobStatus.INDEXING)

    job_queue.reset_running_crawl_jobs()

    check = Session()
    assert check.get(CrawlJob, indexing.id).status == CrawlJobStatus.PENDING
    check.close()


def test_sweep_restores_pending_crawl_that_is_already_indexing(recovery_db):
    Session, db, source = recovery_db
    stuck = _crawl_job(db, source, CrawlJobStatus.PENDING)
    _ingest_batch(db, stuck, BackgroundJobStatus.PENDING.value)
    fresh = _crawl_job(db, source, CrawlJobStatus.PENDING)

    job_queue.sweep_orphaned_indexing_crawl_jobs()

    check = Session()
    assert check.get(CrawlJob, stuck.id).status == CrawlJobStatus.INDEXING
    assert check.get(CrawlJob, fresh.id).status == CrawlJobStatus.PENDING
    check.close()


def test_api_startup_recovery_never_resets_running_jobs(monkeypatch):
    from app.services import job_recovery

    calls: list[str] = []
    for name in (
        "reset_stale_reindex_jobs",
        "reset_running_crawl_jobs",
        "reset_stale_ingest_jobs",
        "cleanup_stale_crawl_jobs",
        "reset_stale_crawl_ingest_batch_jobs",
        "sweep_orphaned_indexing_crawl_jobs",
        "reset_all_stale_running_jobs",
    ):
        monkeypatch.setattr(job_queue, name, lambda n=name: calls.append(n))

    job_recovery.recover_stale_jobs()
    assert not {"reset_running_crawl_jobs", "reset_stale_ingest_jobs", "reset_stale_reindex_jobs"} & set(calls)

    calls.clear()
    job_recovery.recover_jobs_on_worker_start()
    assert {"reset_running_crawl_jobs", "reset_stale_ingest_jobs", "reset_stale_reindex_jobs"} <= set(calls)


def test_worker_poll_session_keeps_claimed_rows_loaded(monkeypatch):
    seen: dict = {}

    class _Session:
        def __init__(self, **kwargs):
            seen.update(kwargs)

        def close(self):
            pass

    monkeypatch.setattr(job_queue, "SessionLocal", _Session)
    monkeypatch.setattr(job_queue, "_claim_next_jobs", lambda db, limit: [])

    assert job_queue.process_pending_jobs(max_jobs=1) == 0
    assert seen.get("expire_on_commit") is False


def test_job_worker_pool_floor_ignores_web_concurrency(monkeypatch):
    from app.platform import db as platform_db
    from app.platform.process_role import JOB_WORKER_PROCESS_ENV

    monkeypatch.setenv("WEB_CONCURRENCY", "2")
    monkeypatch.setattr(platform_db.settings, "run_inline_worker", False)
    monkeypatch.setattr(platform_db.settings, "job_worker_threads", 10)

    monkeypatch.delenv(JOB_WORKER_PROCESS_ENV, raising=False)
    assert platform_db._pool_limits() == (5, 10)

    monkeypatch.setenv(JOB_WORKER_PROCESS_ENV, "1")
    assert platform_db._pool_limits() == (12, 20)
