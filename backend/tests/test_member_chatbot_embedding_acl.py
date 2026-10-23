"""Assigned members can GET chatbot settings and embedding status without owner_id."""

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user_required, get_project_id_or_user
from app.db import get_db
from app.models import (
    Base,
    ChatbotSettings,
    Organization,
    OrganizationMember,
    Project,
    ProjectMember,
    User,
)
from app.routes.chatbot import router as chatbot_router
from app.routes.embeddings import router as embeddings_router


@pytest.fixture()
def acl_ctx(monkeypatch):
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
    member = User(
        username="member",
        email="member@example.com",
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
    session.add_all([owner, member, outsider])
    session.flush()
    session.add_all(
        [
            OrganizationMember(org_id=org.id, user_id=owner.id, role="org_admin", is_active=True),
            OrganizationMember(org_id=org.id, user_id=member.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=outsider.id, role="member", is_active=True),
        ]
    )
    project = Project(name="Assigned", owner_id=owner.id, org_id=org.id, is_active=True)
    session.add(project)
    session.flush()
    session.add(
        ProjectMember(
            project_id=project.id,
            user_id=member.id,
            permissions=["project:read", "chat:use"],
            granted_by=owner.id,
        )
    )
    session.add(
        ChatbotSettings(
            user_id=owner.id,
            project_id=project.id,
            welcome_message="Owner welcome for assigned members",
            short_description="Owner short description",
        )
    )
    session.commit()
    session.refresh(owner)
    session.refresh(member)
    session.refresh(outsider)
    session.refresh(project)

    monkeypatch.setattr(
        "app.routes.embeddings.vector_index_readiness",
        lambda: (False, "index unavailable"),
    )
    monkeypatch.setattr("app.routes.chatbot.emit_audit", lambda **_kwargs: None)

    def client_for(user, router, *, chatbot=False):
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: session
        if chatbot:
            app.dependency_overrides[get_project_id_or_user] = lambda: {
                "type": "user",
                "user": user,
                "user_id": user.id,
            }
        else:
            app.dependency_overrides[get_current_user_required] = lambda: user
        return TestClient(app)

    yield {
        "session": session,
        "project": project,
        "owner": owner,
        "member": member,
        "outsider": outsider,
        "client_for": client_for,
    }
    session.close()


def test_member_get_chatbot_settings_returns_owner_row(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["member"], chatbot_router, chatbot=True)
    response = client.get(
        "/api/v1/chatbot/settings",
        params={"project_id": str(acl_ctx["project"].id)},
    )
    assert response.status_code == 200
    config = response.json()["configuration"]
    assert config["welcome_message"] == "Owner welcome for assigned members"
    assert config["short_description"] == "Owner short description"
    assert config["welcome_message"] != "Hi, how can I help you?"


def test_member_own_settings_row_is_ignored_for_project_settings(acl_ctx):
    acl_ctx["session"].add(
        ChatbotSettings(
            user_id=acl_ctx["member"].id,
            project_id=acl_ctx["project"].id,
            welcome_message="Member-only welcome that must not be used",
            short_description="Member-only description",
            store_history_enabled=True,
        )
    )
    acl_ctx["session"].commit()
    client = acl_ctx["client_for"](acl_ctx["member"], chatbot_router, chatbot=True)
    response = client.get(
        "/api/v1/chatbot/settings",
        params={"project_id": str(acl_ctx["project"].id)},
    )
    assert response.status_code == 200
    config = response.json()["configuration"]
    assert config["welcome_message"] == "Owner welcome for assigned members"
    assert config["store_history_enabled"] is True

    _grant_chatbot_settings_write(acl_ctx)
    save = client.post(
        "/api/v1/chatbot/configuration",
        params={"project_id": str(acl_ctx["project"].id)},
        json={"store_history_enabled": False},
    )
    assert save.status_code == 200
    owner_row = (
        acl_ctx["session"]
        .query(ChatbotSettings)
        .filter(
            ChatbotSettings.user_id == acl_ctx["owner"].id,
            ChatbotSettings.project_id == acl_ctx["project"].id,
        )
        .first()
    )
    member_row = (
        acl_ctx["session"]
        .query(ChatbotSettings)
        .filter(
            ChatbotSettings.user_id == acl_ctx["member"].id,
            ChatbotSettings.project_id == acl_ctx["project"].id,
        )
        .first()
    )
    acl_ctx["session"].refresh(owner_row)
    acl_ctx["session"].refresh(member_row)
    assert owner_row.store_history_enabled is False
    assert member_row.store_history_enabled is True
    assert member_row.welcome_message == "Member-only welcome that must not be used"


def test_unassigned_user_get_chatbot_settings_is_404(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["outsider"], chatbot_router, chatbot=True)
    response = client.get(
        "/api/v1/chatbot/settings",
        params={"project_id": str(acl_ctx["project"].id)},
    )
    assert response.status_code == 404


def test_member_get_embedding_status_is_200(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["member"], embeddings_router)
    response = client.get(
        f"/api/v1/projects/{acl_ctx['project'].id}/embedding-status",
        params={"source": "chat"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == str(acl_ctx["project"].id)
    assert body["source"] == "chat"


def test_unassigned_user_get_embedding_status_is_404(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["outsider"], embeddings_router)
    response = client.get(
        f"/api/v1/projects/{acl_ctx['project'].id}/embedding-status",
        params={"source": "chat"},
    )
    assert response.status_code == 404


def _grant_chatbot_settings_write(acl_ctx):
    row = (
        acl_ctx["session"]
        .query(ProjectMember)
        .filter(
            ProjectMember.project_id == acl_ctx["project"].id,
            ProjectMember.user_id == acl_ctx["member"].id,
        )
        .first()
    )
    row.permissions = ["project:read", "chatbot_settings:write"]
    acl_ctx["session"].commit()


def test_member_with_settings_write_can_save_configuration(acl_ctx):
    _grant_chatbot_settings_write(acl_ctx)
    client = acl_ctx["client_for"](acl_ctx["member"], chatbot_router, chatbot=True)
    response = client.post(
        "/api/v1/chatbot/configuration",
        params={"project_id": str(acl_ctx["project"].id)},
        json={"store_history_enabled": False},
    )
    assert response.status_code == 200
    assert response.json()["store_history_enabled"] is False
    row = (
        acl_ctx["session"]
        .query(ChatbotSettings)
        .filter(
            ChatbotSettings.user_id == acl_ctx["owner"].id,
            ChatbotSettings.project_id == acl_ctx["project"].id,
        )
        .first()
    )
    acl_ctx["session"].refresh(row)
    assert row.store_history_enabled is False


def test_unassigned_user_cannot_save_configuration(acl_ctx):
    client = acl_ctx["client_for"](acl_ctx["outsider"], chatbot_router, chatbot=True)
    response = client.post(
        "/api/v1/chatbot/configuration",
        params={"project_id": str(acl_ctx["project"].id)},
        json={"store_history_enabled": False},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found or access denied"
