"""Onboarding branding white-label gate (CE forces RAGSuite name + null logo)."""
from __future__ import annotations

from datetime import datetime, timezone
import sys
import types

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, InviteStatus, Organization, OrganizationMember, Settings, User
from app.schemas import OnboardingBranding


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


@pytest.fixture
def onboarding_brand(monkeypatch):
    state = {"allowed": False}

    def _can():
        return state["allowed"]

    monkeypatch.setattr(onboarding_routes, "_can_customize_workspace_brand", _can)
    monkeypatch.setattr(onboarding_routes, "_ob_get", lambda _uid: {})
    monkeypatch.setattr(onboarding_routes, "_ob_set", lambda _uid, _data: None)
    return state


def _seed(db_session):
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
    return user, org


@pytest.mark.asyncio
async def test_save_branding_forces_ce_defaults(db_session, onboarding_brand):
    onboarding_brand["allowed"] = False
    user, org = _seed(db_session)

    out = await onboarding_routes.save_branding(
        branding_data=OnboardingBranding(
            org_name="Hacked Co",
            logo_data_url="data:image/png;base64,hack",
            primary_color="#B6802E",
        ),
        db=db_session,
        current_user=user,
    )
    assert out["org_name"] == "RAGSuite"
    assert out["logo_data_url"] is None
    assert out["primary_color"] == "#B6802E"

    db_session.refresh(org)
    assert org.name == "RAGSuite"
    assert org.slug == "ragsuite"

    settings = db_session.query(Settings).filter(Settings.user_id == user.id).first()
    assert settings is not None
    assert settings.org_name == "RAGSuite"
    assert settings.logo_data_url is None
    assert settings.primary_color == "#B6802E"


@pytest.mark.asyncio
async def test_save_branding_allows_ee_customs(db_session, onboarding_brand):
    onboarding_brand["allowed"] = True
    user, org = _seed(db_session)

    out = await onboarding_routes.save_branding(
        branding_data=OnboardingBranding(
            org_name="Partner Co",
            logo_data_url="data:image/png;base64,ee",
            primary_color="#1E3A30",
        ),
        db=db_session,
        current_user=user,
    )
    assert out["org_name"] == "Partner Co"
    assert out["logo_data_url"] == "data:image/png;base64,ee"

    db_session.refresh(org)
    assert org.name == "Partner Co"
    assert org.slug == "partner-co"
