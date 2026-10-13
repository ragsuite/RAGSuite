"""PUT /api/v1/crawl/sites/{id}/answers: lock rules, permissions and cache invalidation."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db as app_db
from app.models import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
    Base,
    CrawlJob,
    CrawlJobStatus,
    CrawlSource,
    Project,
    User,
)
from app.platform.auth import _permission_for_request_path
from app.routes import crawl_source_answers as routes
from app.routes.crawl_source_answers import SourceAnswersRequest
from app.services.rag import kb_generation, source_availability


@pytest.fixture()
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(app_db, "SessionLocal", factory)
    generation = {"value": 0}
    monkeypatch.setattr(kb_generation, "current", lambda: str(generation["value"]))
    monkeypatch.setattr(kb_generation, "bump", lambda: generation.__setitem__("value", generation["value"] + 1))
    audits = []
    monkeypatch.setattr(routes, "emit_audit", lambda **kw: audits.append(kw["event_type"]))
    source_availability.invalidate()
    session = factory()
    session.info["generation"] = generation
    session.info["audits"] = audits
    try:
        yield session
    finally:
        session.close()
        source_availability.invalidate()


@pytest.fixture()
def owner(db):
    user = User(username="owner", email="owner@example.com", hashed_password="x" * 60)
    db.add(user)
    db.commit()
    return user


def _source(db, owner, *, trained=True, documents=0):
    project = Project(name=f"P-{uuid.uuid4().hex[:6]}", owner_id=owner.id)
    db.add(project)
    db.flush()
    source = CrawlSource(
        name="Shop",
        base_url="https://shop.example/",
        depth=2,
        project_id=project.id,
        created_by_id=owner.id,
        trained_at=datetime.now(timezone.utc) if trained else None,
        documents_count=documents,
    )
    db.add(source)
    db.commit()
    return source


def _put(db, user, source_id, enabled):
    return routes.set_source_use_in_answers(
        source_id=source_id, body=SourceAnswersRequest(enabled=enabled), request=None, db=db, current_user=user
    )


def test_route_requires_crawl_manage_permission():
    assert _permission_for_request_path(f"/api/v1/crawl/sites/{uuid.uuid4()}/answers") == "crawl:manage"


def test_audit_events_are_registered():
    from app.services.audit_service import V1_EVENT_TYPES

    assert {"crawl.source.answers_enabled", "crawl.source.answers_disabled"} <= set(V1_EVENT_TYPES)


def test_sources_default_to_used_in_answers(db, owner):
    assert _source(db, owner).use_in_answers is True


def test_toggle_round_trip_bumps_generation_and_updates_availability(db, owner):
    source = _source(db, owner)
    pid = str(source.project_id)
    assert source_availability.disabled_source_ids(pid) == frozenset()

    out = _put(db, owner, source.id, False)
    assert out.use_in_answers is False
    assert db.info["generation"]["value"] == 1
    assert source_availability.disabled_source_ids(pid) == frozenset({str(source.id).lower()})

    out = _put(db, owner, source.id, True)
    assert out.use_in_answers is True
    assert db.info["generation"]["value"] == 2
    assert source_availability.disabled_source_ids(pid) == frozenset()
    assert db.info["audits"] == ["crawl.source.answers_disabled", "crawl.source.answers_enabled"]


def test_repeating_the_current_value_is_a_no_op(db, owner):
    source = _source(db, owner)
    assert _put(db, owner, source.id, True).use_in_answers is True
    assert db.info["generation"]["value"] == 0
    assert db.info["audits"] == []


@pytest.mark.parametrize("status", [CrawlJobStatus.RUNNING, CrawlJobStatus.PENDING, CrawlJobStatus.INDEXING])
def test_locked_while_a_crawl_is_in_flight(db, owner, status):
    source = _source(db, owner)
    db.add(CrawlJob(source_id=source.id, status=status))
    db.commit()
    with pytest.raises(HTTPException) as exc:
        _put(db, owner, source.id, False)
    assert exc.value.status_code == 409
    db.refresh(source)
    assert source.use_in_answers is True


def test_locked_while_ingest_batches_are_pending(db, owner):
    source = _source(db, owner)
    db.add(
        BackgroundJob(
            job_type=BackgroundJobType.CRAWL_INGEST_BATCH.value,
            status=BackgroundJobStatus.PENDING.value,
            payload={"source_id": str(source.id)},
        )
    )
    db.commit()
    with pytest.raises(HTTPException) as exc:
        _put(db, owner, source.id, False)
    assert exc.value.status_code == 409


def test_stopped_source_with_pages_can_be_switched(db, owner):
    source = _source(db, owner, trained=False, documents=12)
    db.add(CrawlJob(source_id=source.id, status=CrawlJobStatus.CANCELLED))
    db.commit()
    assert _put(db, owner, source.id, False).use_in_answers is False


def test_source_without_indexed_content_is_locked(db, owner):
    source = _source(db, owner, trained=False, documents=0)
    with pytest.raises(HTTPException) as exc:
        _put(db, owner, source.id, False)
    assert exc.value.status_code == 409


def test_other_users_and_unknown_sources_get_404(db, owner):
    source = _source(db, owner)
    stranger = User(username="stranger", email="s@example.com", hashed_password="x" * 60)
    db.add(stranger)
    db.commit()
    for user, source_id in ((stranger, source.id), (owner, uuid.uuid4())):
        with pytest.raises(HTTPException) as exc:
            _put(db, user, source_id, False)
        assert exc.value.status_code == 404
    db.refresh(source)
    assert source.use_in_answers is True
