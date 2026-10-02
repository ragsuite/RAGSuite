"""Enterprise per-project retention: policies, grouped preview, purge and confirmation rule."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import (
    AnalyticsDay,
    AuditEvent,
    Base,
    ChatMessage,
    DeletionReceipt,
    Organization,
    Project,
    ProjectRetentionPolicy,
    QueryLog,
    User,
)

pytestmark = pytest.mark.ee

policies = pytest.importorskip("ragsuite_modules.compliance.backend.policies")
preview_mod = pytest.importorskip("ragsuite_modules.compliance.backend.preview")
purge_mod = pytest.importorskip("ragsuite_modules.compliance.backend.purge")
routes_mod = pytest.importorskip("ragsuite_modules.compliance.backend.routes")

NOW = datetime.now(timezone.utc)
OLD = NOW - timedelta(days=120)
RECENT = NOW - timedelta(days=10)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    org = Organization(name="Org", slug="org")
    other_org = Organization(name="Other", slug="other")
    session.add_all([org, other_org])
    session.flush()
    user = User(
        username="admin",
        email="admin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=NOW,
    )
    session.add(user)
    session.flush()
    session.info["org"] = org
    session.info["other_org"] = other_org
    session.info["user"] = user
    yield session
    session.close()


def _project(db, name: str, *, org_id=None, owner_id=None) -> Project:
    project = Project(name=name, owner_id=owner_id or db.info["user"].id, org_id=org_id)
    db.add(project)
    db.flush()
    return project


def _message(db, project: Project, created_at: datetime) -> None:
    db.add(
        ChatMessage(
            message_id=uuid.uuid4(),
            user_id=db.info["user"].id,
            project_id=project.id,
            session_id=f"s-{uuid.uuid4().hex[:6]}",
            user_message="q",
            assistant_response="a",
            message_type="chat",
            created_at=created_at,
        )
    )


def _audit(db, project_id, timestamp: datetime, summary: str) -> None:
    db.add(
        AuditEvent(
            timestamp=timestamp,
            project_id=project_id,
            user_id=db.info["user"].id,
            event_type="project.updated",
            category="project",
            severity="info",
            status="success",
            action="update",
            summary=summary,
        )
    )


def test_org_projects_exclude_org_less_and_foreign_rows(db):
    org, other = db.info["org"], db.info["other_org"]
    own = _project(db, "Own", org_id=org.id)
    legacy = _project(db, "Main Project", org_id=None)
    foreign = _project(db, "Foreign", org_id=other.id)
    db.commit()

    assert {p.id for p in policies.org_projects(db, org.id)} == {own.id}
    assert policies.find_org_project(db, org.id, foreign.id) is None
    assert policies.find_org_project(db, org.id, legacy.id) is None


def test_missing_policy_row_means_auto_delete_off(db):
    project = _project(db, "P", org_id=db.info["org"].id)
    db.commit()
    effective = policies.effective_policies(db, [project.id])[project.id]
    assert effective.auto_delete is False
    assert effective.retention_days == 90


def test_upsert_policy_clamps_days(db):
    project = _project(db, "P", org_id=db.info["org"].id)
    policies.upsert_policy(db, project_id=project.id, auto_delete=True, retention_days=2, user_id=None)
    db.commit()
    row = db.get(ProjectRetentionPolicy, project.id)
    assert row.auto_delete is True
    assert row.retention_days == 7


def test_grouped_preview_uses_each_projects_own_window(db):
    org = db.info["org"]
    long_window = _project(db, "Long", org_id=org.id)
    short_window = _project(db, "Short", org_id=org.id)
    kept = _project(db, "Kept", org_id=org.id)
    for project in (long_window, short_window, kept):
        _message(db, project, OLD)
        _message(db, project, RECENT)
        _audit(db, project.id, OLD, f"old-{project.name}")
    db.add(QueryLog(project_id=short_window.id, user_id=db.info["user"].id, query="q", timestamp=OLD))
    db.add(
        AnalyticsDay(
            date=(NOW - timedelta(days=60)).replace(tzinfo=None),
            project_id=short_window.id,
            org_id=org.id,
            queries=1,
        )
    )
    policies.upsert_policy(db, project_id=long_window.id, auto_delete=True, retention_days=365, user_id=None)
    policies.upsert_policy(db, project_id=short_window.id, auto_delete=True, retention_days=7, user_id=None)
    db.commit()

    effective = policies.effective_policies(db, [long_window.id, short_window.id, kept.id])
    previews = preview_mod.build_project_previews(db, effective.values(), now=NOW)

    assert previews[long_window.id]["eligible_counts"]["chat_messages"] == 0
    short_counts = previews[short_window.id]["eligible_counts"]
    assert short_counts == {"chat_messages": 2, "query_logs": 1, "analytics_days": 1, "audit_events": 1}
    assert previews[kept.id]["auto_delete_active"] is False
    assert previews[kept.id]["eligible_counts"]["chat_messages"] == 0
    assert previews[kept.id]["oldest_interaction_at"] is not None
    assert previews[short_window.id]["days_until_oldest_expires"] == 0
    assert previews[long_window.id]["days_until_oldest_expires"] == 365 - 120


def test_next_purge_estimate_follows_last_purge(db):
    project = _project(db, "P", org_id=db.info["org"].id)
    row = policies.upsert_policy(db, project_id=project.id, auto_delete=True, retention_days=30, user_id=None)
    row.last_purge_at = NOW - timedelta(hours=6)
    db.commit()
    effective = policies.effective_policies(db, [project.id])
    preview = preview_mod.build_project_previews(db, effective.values(), now=NOW)[project.id]
    delta = preview["next_purge_estimate_at"] - (NOW - timedelta(hours=6))
    assert abs(delta.total_seconds() - 24 * 3600) < 2


def test_purge_only_touches_auto_delete_projects_and_keeps_account_audit(db):
    org = db.info["org"]
    purged = _project(db, "Purged", org_id=org.id)
    untouched = _project(db, "Untouched", org_id=org.id)
    for project in (purged, untouched):
        _message(db, project, OLD)
        _message(db, project, RECENT)
        _audit(db, project.id, OLD, f"old-{project.name}")
    _audit(db, None, OLD, "old-account")
    policies.upsert_policy(db, project_id=purged.id, auto_delete=True, retention_days=90, user_id=None)
    db.commit()

    summary = purge_mod.purge_expired_project_data(db, dry_run=False)

    assert summary["projects_purged"] == 1
    assert summary["total_messages"] == 1
    assert summary["total_audit_events"] == 1
    assert db.query(ChatMessage).filter(ChatMessage.project_id == purged.id).count() == 1
    assert db.query(ChatMessage).filter(ChatMessage.project_id == untouched.id).count() == 2
    remaining = {row.summary for row in db.query(AuditEvent).all()}
    assert {"old-Untouched", "old-account"} <= remaining
    assert "old-Purged" not in remaining
    assert db.get(ProjectRetentionPolicy, purged.id).last_purge_at is not None
    receipt = db.query(DeletionReceipt).filter(DeletionReceipt.project_id == purged.id).one()
    assert receipt.trigger_type == "retention"
    assert receipt.org_id == org.id


def test_purge_dry_run_deletes_nothing(db):
    project = _project(db, "P", org_id=db.info["org"].id)
    _message(db, project, OLD)
    policies.upsert_policy(db, project_id=project.id, auto_delete=True, retention_days=90, user_id=None)
    db.commit()

    summary = purge_mod.purge_expired_project_data(db, dry_run=True)

    assert summary["total_messages"] == 1
    assert db.query(ChatMessage).count() == 1
    assert db.get(ProjectRetentionPolicy, project.id).last_purge_at is None


def test_purge_skips_org_less_projects_and_keeps_their_data(db):
    legacy = _project(db, "Main Project", org_id=None)
    _message(db, legacy, OLD)
    policies.upsert_policy(db, project_id=legacy.id, auto_delete=True, retention_days=7, user_id=None)
    db.commit()

    summary = purge_mod.purge_expired_project_data(db, dry_run=False)

    assert summary["projects_purged"] == 0
    assert db.query(ChatMessage).filter(ChatMessage.project_id == legacy.id).count() == 1
    assert db.query(DeletionReceipt).count() == 0


@pytest.mark.parametrize(
    ("saved_on", "saved_days", "draft_on", "draft_days", "expected"),
    [
        (False, 90, False, 30, False),
        (False, 90, True, 90, True),
        (True, 90, True, 30, True),
        (True, 30, True, 90, False),
        (True, 90, False, 90, False),
    ],
)
def test_delete_confirmation_rule(saved_on, saved_days, draft_on, draft_days, expected):
    current = policies.EffectivePolicy(uuid.uuid4(), saved_on, saved_days, None, None)
    assert routes_mod.requires_delete_confirmation(current, draft_on, draft_days) is expected
