"""Assigned members see and (with Settings write) update the project owner's allowlist."""

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
    IntegrationEmbed,
    Organization,
    OrganizationMember,
    Project,
    User,
)
from app.services.member_acl import grant_member_via_group
from app.routes.integrations import router as integrations_router
from app.services.integration_domains import get_project_domain_lists


OWNER_URL = "https://t3planet.de/*"


@pytest.fixture()
def domains_ctx():
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
    outsider = User(
        username="outsider",
        email="outsider@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    session.add_all([owner, reader, writer, outsider])
    session.flush()
    session.add_all(
        [
            OrganizationMember(org_id=org.id, user_id=owner.id, role="org_admin", is_active=True),
            OrganizationMember(org_id=org.id, user_id=reader.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=writer.id, role="member", is_active=True),
            OrganizationMember(org_id=org.id, user_id=outsider.id, role="member", is_active=True),
        ]
    )
    project = Project(name="T3Planet", owner_id=owner.id, org_id=org.id, is_active=True)
    session.add(project)
    session.flush()
    grant_member_via_group(
        session, reader, project, ["project:read", "chatbot_settings:read"], group_name="Readers"
    )
    grant_member_via_group(
        session, writer, project, ["project:read", "chatbot_settings:write"], group_name="Writers"
    )
    session.add(
        IntegrationEmbed(
            user_id=owner.id,
            public_id="docs-widget-owner",
            keys={
                "keys": [],
                "chatbot_domains": [],
                "search_domains": [],
                "by_project": {
                    str(project.id): {
                        "chatbot_domains": [OWNER_URL],
                        "search_domains": [],
                    }
                },
            },
        )
    )
    session.commit()
    session.refresh(owner)
    session.refresh(reader)
    session.refresh(writer)
    session.refresh(outsider)
    session.refresh(project)

    def client_for(user):
        app = FastAPI()
        app.include_router(integrations_router)
        app.dependency_overrides[get_db] = lambda: session
        app.dependency_overrides[get_current_user_required] = lambda: user
        return TestClient(app)

    yield {
        "session": session,
        "project": project,
        "owner": owner,
        "reader": reader,
        "writer": writer,
        "outsider": outsider,
        "client_for": client_for,
    }
    session.close()


def _chatbot_domains(body: dict) -> list:
    return body.get("chatbot_domains") or body.get("chatbotDomains") or []


def test_member_get_embed_returns_owner_domains(domains_ctx):
    client = domains_ctx["client_for"](domains_ctx["reader"])
    response = client.get(
        "/api/v1/integrations/embed",
        params={"project_id": str(domains_ctx["project"].id)},
    )
    assert response.status_code == 200
    assert OWNER_URL in _chatbot_domains(response.json())


def test_unassigned_user_get_embed_is_denied(domains_ctx):
    client = domains_ctx["client_for"](domains_ctx["outsider"])
    response = client.get(
        "/api/v1/integrations/embed",
        params={"project_id": str(domains_ctx["project"].id)},
    )
    assert response.status_code in (403, 404)


def test_member_with_settings_write_updates_owner_domains(domains_ctx):
    extra = "https://localhost//*"
    client = domains_ctx["client_for"](domains_ctx["writer"])
    response = client.post(
        "/api/v1/integrations/embed",
        params={"project_id": str(domains_ctx["project"].id)},
        json={
            "publicId": "docs-widget-writer",
            "keys": [],
            "chatbot_domains": [OWNER_URL, extra],
            "search_domains": [],
        },
    )
    assert response.status_code == 200
    assert extra in _chatbot_domains(response.json())

    owner_client = domains_ctx["client_for"](domains_ctx["owner"])
    owner_response = owner_client.get(
        "/api/v1/integrations/embed",
        params={"project_id": str(domains_ctx["project"].id)},
    )
    assert owner_response.status_code == 200
    owner_domains = _chatbot_domains(owner_response.json())
    assert OWNER_URL in owner_domains
    assert extra in owner_domains

    owner_row = (
        domains_ctx["session"]
        .query(IntegrationEmbed)
        .filter(IntegrationEmbed.user_id == domains_ctx["owner"].id)
        .first()
    )
    stored, _search = get_project_domain_lists(owner_row.keys, domains_ctx["project"].id)
    assert extra in stored


def test_read_member_post_does_not_wipe_owner_domains(domains_ctx):
    client = domains_ctx["client_for"](domains_ctx["reader"])
    get_response = client.get(
        "/api/v1/integrations/embed",
        params={"project_id": str(domains_ctx["project"].id)},
    )
    assert get_response.status_code == 200
    assert OWNER_URL in _chatbot_domains(get_response.json())

    post_response = client.post(
        "/api/v1/integrations/embed",
        params={"project_id": str(domains_ctx["project"].id)},
        json={
            "publicId": "docs-widget-reader",
            "keys": [],
            "chatbot_domains": [],
            "search_domains": [],
        },
    )
    assert post_response.status_code == 200
    assert OWNER_URL in _chatbot_domains(post_response.json())

    owner_row = (
        domains_ctx["session"]
        .query(IntegrationEmbed)
        .filter(IntegrationEmbed.user_id == domains_ctx["owner"].id)
        .first()
    )
    stored, _search = get_project_domain_lists(owner_row.keys, domains_ctx["project"].id)
    assert stored == [OWNER_URL]
