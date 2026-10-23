"""PUT /api/v1/documents/{id}/answers: lock rules, permissions and cache invalidation."""
from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.db as app_db
from app.models import Base, CrawlSource, Project, UploadedDocument, User
from app.platform.auth import _permission_for_request_path
from app.platform.module_bootstrap import ensure_ragsuite_modules_path
from app.services.rag import kb_generation, source_availability
from app.services.textual_sources import QA_MIME, TEXT_MIME

ensure_ragsuite_modules_path()

from ragsuite_modules.documents.backend import answers_routes as routes  # noqa: E402
from ragsuite_modules.documents.backend.answers_routes import DocumentAnswersRequest  # noqa: E402


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
    progress = {}
    monkeypatch.setattr(routes, "get_progress_map", lambda ids: {i: progress[i] for i in ids if i in progress})
    source_availability.invalidate()
    session = factory()
    session.info.update(generation=generation, audits=audits, progress=progress)
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


def _document(db, owner, *, status="Indexed", chunks=4, kind="application/pdf"):
    project = Project(name=f"P-{uuid.uuid4().hex[:6]}", owner_id=owner.id)
    db.add(project)
    db.flush()
    document = UploadedDocument(
        user_id=owner.id,
        project_id=project.id,
        title="Returns policy",
        text_content=b"Returns within 14 days",
        type=kind,
        status=status,
        chunks=chunks,
    )
    db.add(document)
    db.commit()
    return document


def _put(db, user, document_id, enabled):
    return routes.set_document_use_in_answers(
        document_id=document_id, body=DocumentAnswersRequest(enabled=enabled), request=None, db=db, current_user=user
    )


def test_route_requires_documents_manage_permission():
    assert (
        _permission_for_request_path(f"/api/v1/documents/{uuid.uuid4()}/answers", "PUT")
        == "documents:write"
    )


def test_audit_events_are_registered():
    from app.services.audit_service import V1_EVENT_TYPES

    assert {"document.answers_enabled", "document.answers_disabled"} <= set(V1_EVENT_TYPES)


def test_documents_default_to_used_in_answers(db, owner):
    assert _document(db, owner).use_in_answers is True


@pytest.mark.parametrize("kind", ["application/pdf", TEXT_MIME, QA_MIME])
def test_toggle_round_trip_bumps_generation_and_updates_availability(db, owner, kind):
    document = _document(db, owner, kind=kind)
    pid = str(document.project_id)
    doc_id = str(document.id).lower()
    assert source_availability.disabled(pid) == source_availability.NOTHING_DISABLED

    assert _put(db, owner, document.id, False).use_in_answers is False
    assert db.info["generation"]["value"] == 1
    off = source_availability.disabled(pid)
    assert off.documents == frozenset({doc_id}) and off.crawl_sources == frozenset()
    assert source_availability.disabled_source_ids(pid) == frozenset({doc_id})

    assert _put(db, owner, document.id, True).use_in_answers is True
    assert db.info["generation"]["value"] == 2
    assert source_availability.disabled_source_ids(pid) == frozenset()
    assert db.info["audits"] == ["document.answers_disabled", "document.answers_enabled"]


def test_crawl_and_document_switches_are_reported_separately(db, owner):
    document = _document(db, owner)
    source = CrawlSource(
        name="Shop", base_url="https://shop.example/", depth=2, project_id=document.project_id,
        created_by_id=owner.id, use_in_answers=False,
    )
    db.add(source)
    db.commit()
    _put(db, owner, document.id, False)
    off = source_availability.disabled(str(document.project_id))
    assert off.crawl_sources == frozenset({str(source.id).lower()})
    assert off.documents == frozenset({str(document.id).lower()})


def test_repeating_the_current_value_is_a_no_op(db, owner):
    document = _document(db, owner, status="Indexing")
    assert _put(db, owner, document.id, True).use_in_answers is True
    assert db.info["generation"]["value"] == 0
    assert db.info["audits"] == []


@pytest.mark.parametrize("status", ["Queued", "Extracting", "Indexing"])
def test_locked_while_training(db, owner, status):
    document = _document(db, owner, status=status)
    with pytest.raises(HTTPException) as exc:
        _put(db, owner, document.id, False)
    assert exc.value.status_code == 409
    db.refresh(document)
    assert document.use_in_answers is True


def test_locked_while_training_progress_is_live(db, owner):
    document = _document(db, owner)
    db.info["progress"][str(document.id)] = {"percent": 40}
    with pytest.raises(HTTPException) as exc:
        _put(db, owner, document.id, False)
    assert exc.value.status_code == 409


@pytest.mark.parametrize("status", ["Not Trained", "Indexing Failed"])
def test_source_without_trained_content_is_locked(db, owner, status):
    document = _document(db, owner, status=status, chunks=0)
    with pytest.raises(HTTPException) as exc:
        _put(db, owner, document.id, False)
    assert exc.value.status_code == 409


def test_edited_text_source_with_earlier_training_can_be_switched(db, owner):
    document = _document(db, owner, status="Not Trained", chunks=3, kind=TEXT_MIME)
    assert _put(db, owner, document.id, False).use_in_answers is False


def test_other_users_and_unknown_documents_get_404(db, owner):
    document = _document(db, owner)
    stranger = User(username="stranger", email="s@example.com", hashed_password="x" * 60)
    db.add(stranger)
    db.commit()
    for user, document_id in ((stranger, document.id), (owner, uuid.uuid4())):
        with pytest.raises(HTTPException) as exc:
            _put(db, user, document_id, False)
        assert exc.value.status_code == 404
    db.refresh(document)
    assert document.use_in_answers is True
