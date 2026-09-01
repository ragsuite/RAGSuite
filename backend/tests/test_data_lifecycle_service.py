"""Tests for data lifecycle / compliance services."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, ChatMessage, Organization, Project, QueryLog, User
from app.models import AuditEvent
from app.services.data_lifecycle_service import (
    clamp_retention_days,
    delete_chat_message_hard,
    purge_org_audit_events,
    purge_project_interaction_data,
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


def test_clamp_retention_days_bounds():
    assert clamp_retention_days(1) == 7
    assert clamp_retention_days(500) == 365
    assert clamp_retention_days(90) == 90


def test_delete_chat_message_hard_removes_query_logs(db_session):
    db, org, user, project = db_session
    message_id = uuid.uuid4()
    msg = ChatMessage(
        message_id=message_id,
        user_id=user.id,
        project_id=project.id,
        session_id="sess-1",
        user_message="hello",
        assistant_response="world",
        message_type="chat",
    )
    db.add(msg)
    db.flush()

    log = QueryLog(
        project_id=project.id,
        user_id=user.id,
        query="hello",
        chat_message_id=message_id,
    )
    db.add(log)
    db.commit()

    receipt = delete_chat_message_hard(
        db,
        msg,
        org_id=org.id,
        user_id=user.id,
        redis_scopes=set(),
    )
    db.commit()

    assert receipt.id is not None
    assert db.query(ChatMessage).filter(ChatMessage.message_id == message_id).count() == 0
    assert db.query(QueryLog).filter(QueryLog.chat_message_id == message_id).count() == 0
    assert receipt.manifest["counts"]["chat_messages"] == 1


def test_purge_project_interaction_data_dry_run(db_session):
    db, org, user, project = db_session
    old = datetime.now(timezone.utc) - timedelta(days=120)
    msg = ChatMessage(
        message_id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        session_id="old-sess",
        user_message="old",
        assistant_response="old",
        message_type="chat",
        created_at=old,
    )
    db.add(msg)
    db.commit()

    counts = purge_project_interaction_data(
        db,
        org_id=org.id,
        project_id=project.id,
        cutoff=datetime.now(timezone.utc) - timedelta(days=90),
        retention_days=90,
        dry_run=True,
    )
    assert counts["chat_messages"] >= 1
    assert db.query(ChatMessage).filter(ChatMessage.id == msg.id).count() == 1


def test_purge_org_audit_events_removes_old_rows(db_session):
    db, org, user, project = db_session
    old = datetime.now(timezone.utc) - timedelta(days=120)
    recent = datetime.now(timezone.utc) - timedelta(days=10)

    old_project_event = AuditEvent(
        timestamp=old,
        project_id=project.id,
        user_id=user.id,
        event_type="project.updated",
        category="project",
        severity="info",
        status="success",
        action="update",
        summary="Old project event",
    )
    recent_project_event = AuditEvent(
        timestamp=recent,
        project_id=project.id,
        user_id=user.id,
        event_type="project.updated",
        category="project",
        severity="info",
        status="success",
        action="update",
        summary="Recent project event",
    )
    old_account_event = AuditEvent(
        timestamp=old,
        project_id=None,
        user_id=user.id,
        event_type="auth.login",
        category="auth",
        severity="info",
        status="success",
        action="login",
        summary="Old account event",
    )
    anonymous_event = AuditEvent(
        timestamp=old,
        project_id=None,
        user_id=None,
        event_type="auth.login.failed",
        category="auth",
        severity="warning",
        status="failure",
        action="login",
        summary="Anonymous failed login",
    )
    db.add_all(
        [old_project_event, recent_project_event, old_account_event, anonymous_event]
    )
    db.commit()

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    deleted = purge_org_audit_events(
        db,
        org_id=org.id,
        project_ids=[project.id],
        cutoff=cutoff,
        dry_run=False,
    )
    assert deleted == 2
    assert db.query(AuditEvent).count() == 2
    summaries = {row.summary for row in db.query(AuditEvent).all()}
    assert "Recent project event" in summaries
    assert "Anonymous failed login" in summaries
    assert "Old project event" not in summaries
    assert "Old account event" not in summaries


def test_purge_org_audit_events_dry_run(db_session):
    db, org, user, project = db_session
    old = datetime.now(timezone.utc) - timedelta(days=120)
    db.add(
        AuditEvent(
            timestamp=old,
            project_id=project.id,
            user_id=user.id,
            event_type="project.updated",
            category="project",
            severity="info",
            status="success",
            action="update",
            summary="Dry run event",
        )
    )
    db.commit()

    cutoff = datetime.now(timezone.utc) - timedelta(days=90)
    count = purge_org_audit_events(
        db,
        org_id=org.id,
        project_ids=[project.id],
        cutoff=cutoff,
        dry_run=True,
    )
    assert count == 1
    assert db.query(AuditEvent).count() == 1
