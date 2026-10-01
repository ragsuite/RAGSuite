"""Community 15-day audit window and purge; Enterprise keeps full history."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_active_project, get_current_user_required
from app.db import get_db
from app.models import AuditEvent, Base, Organization, Project, User
from app.platform import ee_feature_gate, entitlement_deps
from app.platform.module_bootstrap import ensure_ragsuite_modules_path
from app.services import audit_retention_policy as policy

ensure_ragsuite_modules_path()

from ragsuite_modules.audit_basic.backend.routes import router as audit_router  # noqa: E402


def _set_edition(monkeypatch, *, licensed: bool, installed: bool) -> None:
    monkeypatch.setattr(entitlement_deps, "has_feature_entitlement", lambda *_f: licensed)
    monkeypatch.setattr(ee_feature_gate, "enterprise_module_loaded", lambda _m: installed)


@pytest.fixture
def community(monkeypatch):
    _set_edition(monkeypatch, licensed=False, installed=False)


@pytest.fixture
def enterprise(monkeypatch):
    _set_edition(monkeypatch, licensed=True, installed=True)


@pytest.fixture
def db_env():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    org = Organization(name="Org", slug="org")
    session.add(org)
    session.flush()
    user = User(
        username="owner",
        email="owner@example.com",
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
    yield session, user, project
    session.close()


def _event(project_id, user_id, age_days: int) -> AuditEvent:
    return AuditEvent(
        timestamp=datetime.now(timezone.utc) - timedelta(days=age_days),
        project_id=project_id,
        user_id=user_id,
        event_type="project.updated",
        category="project",
        severity="info",
        status="success",
        action="update",
        summary=f"Event {age_days}d old",
    )


def _seed(db, user, project):
    recent = _event(project.id, user.id, 3)
    old = _event(project.id, user.id, 40)
    db.add_all([recent, old])
    db.commit()
    return recent, old


@pytest.fixture
def client(db_env):
    db, user, project = db_env
    app = FastAPI()
    app.include_router(audit_router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user_required] = lambda: user
    app.dependency_overrides[get_active_project] = lambda: project
    return TestClient(app)


# --- policy ---------------------------------------------------------------


def test_community_window_is_15_days(community):
    assert policy.COMMUNITY_AUDIT_WINDOW_DAYS == 15
    assert policy.full_audit_history_enabled() is False
    assert policy.audit_list_window_days() == 15
    assert policy.audit_purge_allowed() is True


def test_enterprise_window_is_unlimited(enterprise):
    assert policy.full_audit_history_enabled() is True
    assert policy.audit_list_window_days() is None
    assert policy.audit_purge_allowed() is False


def test_lapsed_license_limits_view_but_never_purges(monkeypatch):
    _set_edition(monkeypatch, licensed=False, installed=True)
    assert policy.audit_list_window_days() == 15
    assert policy.audit_purge_allowed() is False


def test_license_without_module_stays_community(monkeypatch):
    _set_edition(monkeypatch, licensed=True, installed=False)
    assert policy.audit_list_window_days() == 15


# --- purge ----------------------------------------------------------------


def test_purge_removes_only_events_older_than_window(community, db_env):
    db, user, project = db_env
    recent, old = _seed(db, user, project)
    boundary = _event(project.id, user.id, 14)
    db.add(boundary)
    db.commit()
    keep_ids = {recent.id, boundary.id}

    assert policy.purge_community_audit_events(db) == 1
    db.expire_all()
    remaining = {row.id for row in db.query(AuditEvent).all()}
    assert remaining == keep_ids


def test_purge_batches_large_backlogs(community, db_env, monkeypatch):
    db, user, project = db_env
    monkeypatch.setattr(policy, "PURGE_BATCH_SIZE", 2)
    db.add_all([_event(project.id, user.id, 30 + i) for i in range(5)])
    db.commit()

    assert policy.purge_community_audit_events(db) == 5
    assert db.query(AuditEvent).count() == 0


def test_purge_dry_run_deletes_nothing(community, db_env):
    db, user, project = db_env
    _seed(db, user, project)
    assert policy.purge_community_audit_events(db, dry_run=True) == 1
    assert db.query(AuditEvent).count() == 2


def test_purge_is_noop_on_enterprise(enterprise, db_env):
    db, user, project = db_env
    _seed(db, user, project)
    assert policy.purge_community_audit_events(db) == 0
    assert db.query(AuditEvent).count() == 2


# --- routes ---------------------------------------------------------------


def test_list_applies_community_window(community, db_env, client):
    db, user, project = db_env
    recent, _old = _seed(db, user, project)

    body = client.get("/api/v1/audit-events").json()
    assert body["retention_days"] == 15
    assert body["total"] == 1
    assert body["events"][0]["id"] == str(recent.id)


def test_list_start_date_cannot_reach_past_window(community, db_env, client):
    db, user, project = db_env
    _seed(db, user, project)
    since = (datetime.now(timezone.utc) - timedelta(days=90)).isoformat()

    body = client.get("/api/v1/audit-events", params={"start_date": since}).json()
    assert body["total"] == 1


def test_list_is_unlimited_on_enterprise(enterprise, db_env, client):
    db, user, project = db_env
    _seed(db, user, project)

    body = client.get("/api/v1/audit-events").json()
    assert body["retention_days"] is None
    assert body["total"] == 2


def test_detail_hides_events_outside_community_window(community, db_env, client):
    db, user, project = db_env
    recent, old = _seed(db, user, project)

    assert client.get(f"/api/v1/audit-events/{recent.id}").status_code == 200
    response = client.get(f"/api/v1/audit-events/{old.id}")
    assert response.status_code == 404
    assert response.json()["detail"] == "Audit event not found"


def test_detail_returns_old_events_on_enterprise(enterprise, db_env, client):
    db, user, project = db_env
    _recent, old = _seed(db, user, project)
    assert client.get(f"/api/v1/audit-events/{old.id}").status_code == 200


def test_unknown_detail_still_404(community, client):
    assert client.get(f"/api/v1/audit-events/{uuid.uuid4()}").status_code == 404
