"""Community 15-day audit view window (no deletion); Enterprise shows full history."""
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


def test_enterprise_window_is_unlimited(enterprise):
    assert policy.full_audit_history_enabled() is True
    assert policy.audit_list_window_days() is None


def test_lapsed_license_limits_view(monkeypatch):
    _set_edition(monkeypatch, licensed=False, installed=True)
    assert policy.audit_list_window_days() == 15


def test_license_without_module_stays_community(monkeypatch):
    _set_edition(monkeypatch, licensed=True, installed=False)
    assert policy.audit_list_window_days() == 15


def _real_license(monkeypatch, *, entitlements: list[str] | None, installed: bool) -> None:
    """Exercise the real entitlement matcher; only the license source is stubbed."""
    from types import SimpleNamespace

    from app.platform import crl_client, license_state

    claims = None if entitlements is None else SimpleNamespace(license_id="lic-test")
    monkeypatch.setattr(license_state, "get_claims", lambda **_kw: claims)
    monkeypatch.setattr(license_state, "effective_entitlements", lambda _c: list(entitlements or []))
    monkeypatch.setattr(crl_client, "is_revoked", lambda _lid: False)
    monkeypatch.setattr(ee_feature_gate, "enterprise_module_loaded", lambda _m: installed)


def test_real_matcher_enterprise_license_is_unlimited(monkeypatch):
    _real_license(monkeypatch, entitlements=["analytics", "audit_full", "sso"], installed=True)
    assert policy.full_audit_history_enabled() is True
    assert policy.audit_list_window_days() is None


def test_real_matcher_no_license_is_community(monkeypatch):
    _real_license(monkeypatch, entitlements=None, installed=False)
    assert policy.audit_list_window_days() == 15


def test_real_matcher_license_without_audit_full_is_community(monkeypatch):
    _real_license(monkeypatch, entitlements=["analytics", "sso"], installed=True)
    assert policy.audit_list_window_days() == 15


# --- storage --------------------------------------------------------------


def test_community_hides_old_events_without_deleting_them(monkeypatch, db_env, client):
    db, user, project = db_env
    _seed(db, user, project)

    _set_edition(monkeypatch, licensed=False, installed=False)
    assert client.get("/api/v1/audit-events").json()["total"] == 1
    assert db.query(AuditEvent).count() == 2

    _set_edition(monkeypatch, licensed=True, installed=True)
    assert client.get("/api/v1/audit-events").json()["total"] == 2


def test_policy_exposes_no_purge():
    assert not hasattr(policy, "purge_community_audit_events")
    assert not hasattr(policy, "run_community_audit_purge")


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
