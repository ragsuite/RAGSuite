"""Members with Settings Project access can read session-timeout (not org-admin-only)."""

from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import get_current_user_required
from app.db import get_db
from app.models import Base, Organization, OrganizationMember, Project, User
from app.services.member_acl import grant_member_via_group
from app.routes.settings import router as settings_router


@pytest.fixture()
def member_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    now = datetime.now(timezone.utc)
    org = Organization(name="Org", slug="org", session_timeout_minutes=45, session_timeout_enabled=True)
    session.add(org)
    session.flush()
    member = User(
        username="member",
        email="member@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
    )
    session.add(member)
    session.flush()
    session.add(
        OrganizationMember(org_id=org.id, user_id=member.id, role="member", is_active=True)
    )
    project = Project(name="Assigned", owner_id=member.id, org_id=org.id, is_active=True)
    session.add(project)
    session.flush()
    grant_member_via_group(
        session,
        member,
        project,
        ["project:read", "settings_data_retention:read", "settings_session_timeout:read"],
    )
    session.commit()
    session.refresh(member)

    def client_for(router):
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: session
        app.dependency_overrides[get_current_user_required] = lambda: member
        return TestClient(app)

    yield {
        "client": client_for(settings_router),
        "client_for": client_for,
        "project_id": project.id,
        "session": session,
        "member": member,
    }
    session.close()


def test_member_can_get_session_timeout(member_client):
    response = member_client["client"].get("/api/v1/settings/session-timeout")
    assert response.status_code == 200
    body = response.json()
    assert body["session_timeout_minutes"] == 45
    assert body["session_timeout_enabled"] is True


@pytest.mark.ee
def test_member_can_list_project_retention(member_client):
    routes_mod = pytest.importorskip("ragsuite_modules.compliance.backend.routes")
    client = member_client["client_for"](routes_mod.router)
    response = client.get("/api/v1/compliance/retention/projects")
    assert response.status_code == 200
    items = response.json()["items"]
    assert len(items) == 1
    assert items[0]["project_id"] == str(member_client["project_id"])
