"""Tests for crawl count semantics and completion messaging."""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, CrawlJob, CrawlJobStatus, CrawlSource, Document, Organization, Project, User
from app.services.crawl_ingest_helpers import (
    batch_document_counts_by_source_ids,
    crawl_completion_notification_message,
    crawl_status_message_from_job,
    get_crawl_diagnostics,
    reconcile_source_documents_count,
)


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    org = Organization(name="Test Org", slug="test-org")
    session.add(org)
    session.flush()
    user = User(
        username="tester",
        email="tester@example.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()
    project = Project(name="P1", owner_id=user.id, org_id=org.id)
    session.add(project)
    session.commit()
    yield session, org, user, project
    session.close()


def test_reconcile_source_documents_count_heals_stale_value(db_session):
    db, _org, _user, project = db_session
    source = CrawlSource(
        id=uuid.uuid4(),
        name="Example",
        base_url="https://example.com",
        depth=2,
        created_by_id=_user.id,
        project_id=project.id,
        documents_count=0,
    )
    db.add(source)
    db.flush()

    for index in range(5):
        db.add(
            Document(
                id=uuid.uuid4(),
                source_id=source.id,
                url=f"https://example.com/page-{index}",
                title=f"Page {index}",
                text_content="content",
            )
        )
    db.commit()

    count = reconcile_source_documents_count(db, source)
    db.commit()
    db.refresh(source)

    assert count == 5
    assert source.documents_count == 5


def test_batch_document_counts_by_source_ids(db_session):
    db, _org, _user, project = db_session
    source_a = CrawlSource(
        id=uuid.uuid4(),
        name="A",
        base_url="https://a.example",
        depth=1,
        created_by_id=_user.id,
        project_id=project.id,
    )
    source_b = CrawlSource(
        id=uuid.uuid4(),
        name="B",
        base_url="https://b.example",
        depth=1,
        created_by_id=_user.id,
        project_id=project.id,
    )
    db.add_all([source_a, source_b])
    db.flush()
    db.add(
        Document(
            id=uuid.uuid4(),
            source_id=source_a.id,
            url="https://a.example/",
            title="A",
            text_content="x",
        )
    )
    db.commit()

    counts = batch_document_counts_by_source_ids(db, [source_a.id, source_b.id])
    assert counts[source_a.id] == 1
    assert counts.get(source_b.id, 0) == 0


def test_get_crawl_diagnostics_from_job_errors():
    errors = [
        {"type": "crawl_diagnostics", "crawled_urls_total": 278, "documents_saved": 0},
    ]
    diag = get_crawl_diagnostics(errors)
    assert diag is not None
    assert diag["crawled_urls_total"] == 278
    assert diag["documents_saved"] == 0


def test_crawl_completion_notification_uses_diagnostics():
    source = CrawlSource(
        id=uuid.uuid4(),
        name="Example",
        base_url="https://example.com",
        created_by_id=1,
    )
    job = CrawlJob(
        source_id=source.id,
        status=CrawlJobStatus.COMPLETED,
        pages_fetched=0,
        errors=[
            {
                "type": "crawl_diagnostics",
                "crawled_urls_total": 278,
                "documents_saved": 0,
            }
        ],
    )
    message = crawl_completion_notification_message(job, source)
    assert "278 pages" in message
    assert "indexed 0 documents" in message
    assert "https://example.com" in message


def test_crawl_completion_notification_fallback_without_diagnostics():
    source = CrawlSource(
        id=uuid.uuid4(),
        name="Example",
        base_url="https://example.com",
        created_by_id=1,
    )
    job = CrawlJob(
        source_id=source.id,
        status=CrawlJobStatus.COMPLETED,
        pages_fetched=12,
        errors=[],
    )
    message = crawl_completion_notification_message(job, source)
    assert "12 pages" in message
    assert "indexed 12 documents" in message


def test_crawl_status_message_running_uses_visited_wording():
    job = CrawlJob(
        source_id=uuid.uuid4(),
        status=CrawlJobStatus.RUNNING,
        pages_fetched=16,
    )
    msg = crawl_status_message_from_job(job)
    assert "16 pages visited" in msg
    assert "saved" not in msg


def test_recrawl_no_content_change_count_semantics():
    """Re-crawl: visited > 0, saved = 0 — diagnostics must preserve both."""
    errors = [
        {
            "type": "crawl_diagnostics",
            "crawled_urls_total": 10,
            "documents_saved": 0,
            "skipped_count": 9,
            "failed_count": 0,
            "crawled_urls": [{"url": "https://example.com/"}],
            "skipped_urls": [],
            "failed_urls": [],
        }
    ]
    diag = get_crawl_diagnostics(errors)
    assert diag["crawled_urls_total"] == 10
    assert diag["documents_saved"] == 0
    assert len(diag["crawled_urls"]) == 1
