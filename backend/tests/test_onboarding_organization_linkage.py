from datetime import datetime, timezone
import uuid
import sys
import types

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, InviteStatus, Organization, OrganizationMember, Project, Settings, User
from app.schemas import OnboardingBranding, OnboardingProject


def _install_scrapy_stubs() -> None:
    if "scrapy" in sys.modules:
        return
    scrapy = types.ModuleType("scrapy")
    scrapy.signals = object()
    scrapy.Spider = object
    sys.modules["scrapy"] = scrapy
    scrapy_http = types.ModuleType("scrapy.http")
    scrapy_http.Request = object
    sys.modules["scrapy.http"] = scrapy_http
    scrapy_crawler = types.ModuleType("scrapy.crawler")
    scrapy_crawler.CrawlerProcess = object
    sys.modules["scrapy.crawler"] = scrapy_crawler
    scrapy_utils_project = types.ModuleType("scrapy.utils.project")
    scrapy_utils_project.get_project_settings = lambda: {}
    sys.modules["scrapy.utils.project"] = scrapy_utils_project
    scrapy_playwright_page = types.ModuleType("scrapy_playwright.page")
    scrapy_playwright_page.PageMethod = object
    sys.modules["scrapy_playwright.page"] = scrapy_playwright_page
    sys.modules["pandas"] = types.ModuleType("pandas")


_install_scrapy_stubs()
from app.routes import onboarding as onboarding_routes


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()


@pytest.mark.asyncio
async def test_save_onboarding_project_sets_org_id(db_session, monkeypatch):
    org = Organization(name="Default Organization", slug="default")
    db_session.add(org)
    db_session.flush()

    user = User(
        username="founder",
        email="founder@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=user.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
        )
    )
    db_session.commit()
    stored_data = {"branding": {"org_name": "Nitsan Tech", "logo_data_url": None, "primary_color": "#2E6A4E"}}
    monkeypatch.setattr(onboarding_routes, "_ob_get", lambda _user_id: stored_data)
    monkeypatch.setattr(onboarding_routes, "_ob_set", lambda _user_id, data: stored_data.update(data))

    response = await onboarding_routes.save_onboarding_project(
        project_data=OnboardingProject(name="Nitsan AI", description="Core workspace"),
        db=db_session,
        current_user=user,
    )

    created = db_session.query(Project).filter(Project.id == uuid.UUID(response["id"])).first()
    assert created is not None
    assert created.org_id == org.id
    db_session.refresh(org)
    assert org.name == "Nitsan Tech"


@pytest.mark.asyncio
async def test_complete_onboarding_syncs_org_name_and_project_org(db_session, monkeypatch):
    org = Organization(name="Default Organization", slug="default")
    db_session.add(org)
    db_session.flush()

    user = User(
        username="orgadmin",
        email="orgadmin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=user.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
        )
    )
    project = Project(
        name="Workspace",
        description="onboarding project",
        owner_id=user.id,
        org_id=None,
        is_active=False,
    )
    db_session.add(project)
    db_session.commit()

    onboarding_data = {
        "branding": {
            "org_name": "Nitsan Technologies",
            "logo_data_url": None,
            "primary_color": "#00AA99",
        },
        "project": {
            "name": project.name,
            "description": project.description,
            "project_id": str(project.id),
        },
    }
    monkeypatch.setattr(onboarding_routes, "_ob_get", lambda _user_id: onboarding_data)
    monkeypatch.setattr(onboarding_routes, "_ob_delete", lambda _user_id: None)

    await onboarding_routes.complete_onboarding(
        db=db_session,
        current_user=user,
        background_tasks=None,
    )

    db_session.refresh(project)
    db_session.refresh(user)
    db_session.refresh(org)

    assert project.org_id == org.id
    assert project.is_active is True
    assert user.onboarding_completed_at is not None
    assert org.name == "Nitsan Technologies"
    assert org.slug.startswith("nitsan-technologies")


def _seed_org_admin(db_session):
    org = Organization(name="Default Organization", slug="default")
    db_session.add(org)
    db_session.flush()

    user = User(
        username="orgadmin",
        email="orgadmin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    db_session.add(user)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=user.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
        )
    )
    db_session.commit()
    return org, user


@pytest.mark.asyncio
async def test_save_branding_persists_org_and_settings_immediately(db_session, monkeypatch):
    org, user = _seed_org_admin(db_session)
    stored_data: dict = {}
    monkeypatch.setattr(onboarding_routes, "_ob_get", lambda _user_id: stored_data)
    monkeypatch.setattr(
        onboarding_routes,
        "_ob_set",
        lambda _user_id, data: stored_data.update(data),
    )

    await onboarding_routes.save_branding(
        branding_data=OnboardingBranding(
            org_name="BGE",
            logo_data_url=None,
            primary_color="#2E6A4E",
        ),
        db=db_session,
        current_user=user,
    )

    db_session.refresh(org)
    settings = db_session.query(Settings).filter(Settings.user_id == user.id).first()
    assert org.name == "BGE"
    assert org.slug == "bge"
    assert settings is not None
    assert settings.org_name == "BGE"
    assert settings.primary_color == "#2E6A4E"


@pytest.mark.asyncio
async def test_get_branding_falls_back_to_persisted_settings(db_session, monkeypatch):
    org, user = _seed_org_admin(db_session)
    db_session.add(
        Settings(
            user_id=user.id,
            org_name="BGE",
            logo_data_url=None,
            primary_color="#B6802E",
        )
    )
    db_session.commit()

    monkeypatch.setattr(onboarding_routes, "_ob_get", lambda _user_id: {})

    response = await onboarding_routes.get_branding(
        db=db_session,
        current_user=user,
    )

    assert response["org_name"] == "BGE"
    assert response["primary_color"] == "#B6802E"
    assert response["has_color"] is True
