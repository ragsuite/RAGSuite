"""Tests for retention preview service."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import AnalyticsDay, AuditEvent, Base, ChatMessage, Organization, Project, QueryLog, User
from app.services.retention_preview_service import build_retention_preview


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


def test_preview_inactive_when_auto_delete_false(db_session):
    db, org, user, project = db_session
    org.retention_auto_delete = False
    org.retention_days = 90
    db.commit()

    preview = build_retention_preview(db, org)
    assert preview["auto_delete_active"] is False
    assert preview["cutoff_at"] is not None
    assert preview["new_data_expires_at"] is not None
    assert preview["days_until_new_data_expires"] == 90
    assert preview["eligible_counts"]["chat_messages"] == 0
    assert preview["eligible_counts"]["audit_events"] == 0
    assert preview["next_purge_estimate_at"] is None


def test_preview_cutoff_and_eligible_counts(db_session):
    db, org, user, project = db_session
    org.retention_auto_delete = True
    org.retention_days = 90
    db.commit()

    old = datetime.now(timezone.utc) - timedelta(days=120)
    recent = datetime.now(timezone.utc) - timedelta(days=10)

    old_msg = ChatMessage(
        message_id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        session_id="old",
        user_message="old",
        assistant_response="old",
        message_type="chat",
        created_at=old,
    )
    recent_msg = ChatMessage(
        message_id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        session_id="recent",
        user_message="recent",
        assistant_response="recent",
        message_type="chat",
        created_at=recent,
    )
    db.add_all([old_msg, recent_msg])

    old_log = QueryLog(
        project_id=project.id,
        user_id=user.id,
        query="old query",
        timestamp=old,
    )
    recent_log = QueryLog(
        project_id=project.id,
        user_id=user.id,
        query="recent query",
        timestamp=recent,
    )
    db.add_all([old_log, recent_log])

    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=90)).replace(tzinfo=None)
    old_analytics = AnalyticsDay(
        date=cutoff_date - timedelta(days=5),
        project_id=project.id,
        org_id=org.id,
        queries=1,
    )
    recent_analytics = AnalyticsDay(
        date=cutoff_date + timedelta(days=1),
        project_id=project.id,
        org_id=org.id,
        queries=1,
    )
    db.add_all([old_analytics, recent_analytics])

    old_audit = AuditEvent(
        timestamp=old,
        project_id=project.id,
        user_id=user.id,
        event_type="project.updated",
        category="project",
        severity="info",
        status="success",
        action="update",
        summary="Old audit",
    )
    recent_audit = AuditEvent(
        timestamp=recent,
        project_id=project.id,
        user_id=user.id,
        event_type="project.updated",
        category="project",
        severity="info",
        status="success",
        action="update",
        summary="Recent audit",
    )
    db.add_all([old_audit, recent_audit])
    db.commit()

    preview = build_retention_preview(db, org)
    assert preview["auto_delete_active"] is True
    assert preview["cutoff_at"] is not None
    assert preview["eligible_counts"]["chat_messages"] == 1
    assert preview["eligible_counts"]["query_logs"] == 1
    assert preview["eligible_counts"]["analytics_days"] == 1
    assert preview["eligible_counts"]["audit_events"] == 1
    assert preview["days_until_new_data_expires"] == 90
    assert preview["new_data_expires_at"] is not None
    assert preview["oldest_interaction_at"] is not None
    assert preview["days_until_oldest_expires"] is not None
    assert preview["days_until_oldest_expires"] >= 0


def test_preview_next_purge_estimate(db_session):
    db, org, user, project = db_session
    org.retention_auto_delete = True
    org.retention_days = 30
    last_purge = datetime.now(timezone.utc) - timedelta(hours=6)
    org.retention_last_purge_at = last_purge
    db.commit()

    preview = build_retention_preview(db, org)
    assert preview["next_purge_estimate_at"] is not None
    delta = preview["next_purge_estimate_at"] - last_purge
    assert abs(delta.total_seconds() - 24 * 3600) < 2
