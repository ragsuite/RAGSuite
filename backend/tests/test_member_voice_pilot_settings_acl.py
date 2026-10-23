"""Chatbot Settings members can use Voice Pilot settings APIs without voice_pilot keys."""

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user_required
from app.db import get_db
from app.models import (
    Base,
    Organization,
    OrganizationMember,
    Project,
    ProjectMember,
    User,
)
from app.platform.module_bootstrap import ensure_ragsuite_modules_path

ensure_ragsuite_modules_path()

from ragsuite_modules.ai_voice_pilot.backend.routes import router as voice_pilot_router


@pytest.fixture()
def acl_ctx():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    now = datetime.now(timezone.utc)
    org = Organization(name="Org", slug="org")
    session.add(org)
    session.flush()

    owner = User(
        username="owner",
        email="owner@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    reader = User(
        username="reader",
        email="reader@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    writer = User(
        username="writer",
        email="writer@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    voice_only = User(
        username="voice",
        email="voice@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    outsider = User(
        username="outsider",
        email="outsider@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    session.add_all([owner, reader, writer, voice_only, outsider])
    session.flush()
    session.add_all(
        [
            OrganizationMember(org_id=org.id, user_id=owner.id, role="org_admin", is_active=True),
            OrganizationMember(org_id=org.id, user_id=reader.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=writer.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=voice_only.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=outsider.id, role="member", is_active=True),
        ]
    )
    project = Project(name="Assigned", owner_id=owner.id, org_id=org.id, is_active=True)
    session.add(project)
    session.flush()
    session.add_all(
        [
            ProjectMember(
                project_id=project.id,
                user_id=reader.id,
                permissions=["project:read", "chatbot_settings:read"],
                granted_by=owner.id,
            ),
            ProjectMember(
                project_id=project.id,
                user_id=writer.id,
                permissions=["project:read", "chatbot_settings:write"],
                granted_by=owner.id,
            ),
            ProjectMember(
                project_id=project.id,
                user_id=voice_only.id,
                permissions=["project:read", "voice_pilot:write"],
                granted_by=owner.id,
            ),
        ]
    )
    session.commit()
    session.refresh(owner)
    session.refresh(reader)
    session.refresh(writer)
    session.refresh(voice_only)
    session.refresh(outsider)
    session.refresh(project)

    def client_for(user):
        app = FastAPI()
        app.include_router(voice_pilot_router)
        app.dependency_overrides[get_db] = lambda: session
        app.dependency_overrides[get_current_user_required] = lambda: user
        return TestClient(app)

    yield {
        "project": project,
        "reader": reader,
        "writer": writer,
        "voice_only": voice_only,
        "outsider": outsider,
        "client_for": client_for,
    }
    session.close()


def _headers(acl_ctx):
    return {"X-Project-ID": str(acl_ctx["project"].id)}


def test_chatbot_settings_read_can_get_voice_pilot_settings(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["reader"])
    response = client.get("/api/v1/voice-pilot/settings", headers=_headers(acl_ctx))
    assert response.status_code == 200


def test_chatbot_settings_read_cannot_put_voice_pilot_settings(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["reader"])
    response = client.put(
        "/api/v1/voice-pilot/settings",
        headers=_headers(acl_ctx),
        json={"stt_locale": "de-DE"},
    )
    assert response.status_code == 403


def test_chatbot_settings_write_can_put_voice_pilot_settings(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["writer"])
    response = client.put(
        "/api/v1/voice-pilot/settings",
        headers=_headers(acl_ctx),
        json={"stt_locale": "de-DE"},
    )
    assert response.status_code == 200
    assert response.json()["stt_locale"] == "de-DE"


def test_voice_pilot_write_still_can_put_settings(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["voice_only"])
    response = client.put(
        "/api/v1/voice-pilot/settings",
        headers=_headers(acl_ctx),
        json={"stt_locale": "fr-FR"},
    )
    assert response.status_code == 200
    assert response.json()["stt_locale"] == "fr-FR"


def test_unassigned_member_cannot_get_voice_pilot_settings(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["outsider"])
    response = client.get("/api/v1/voice-pilot/settings", headers=_headers(acl_ctx))
    assert response.status_code == 403
