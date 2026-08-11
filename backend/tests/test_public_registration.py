"""Bootstrap-first registration and invite activation tests."""
from datetime import datetime, timedelta, timezone
import sys
import types

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.models import Base, InviteStatus, Organization, OrganizationMember, User


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
    sys.modules["pyotp"] = types.ModuleType("pyotp")
    qrcode = types.ModuleType("qrcode")
    qrcode.QRCode = object
    sys.modules["qrcode"] = qrcode


_install_scrapy_stubs()
from app.routes.crawl import get_public_auth_config, limiter, register_user
from app.schemas import UserCreate
from app.settings import settings


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.mark.asyncio
async def test_public_auth_config_follows_env_and_org_gate(db_session, monkeypatch):
    org = Organization(name="Default", slug="default", registration_enabled=True)
    db_session.add(org)
    db_session.flush()
    now = datetime.now(timezone.utc)
    admin = User(
        username="admin",
        email="admin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    db_session.add(admin)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=admin.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
            joined_at=now,
        )
    )
    db_session.commit()

    monkeypatch.setattr(settings, "allow_public_registration", False)
    result = await get_public_auth_config(db_session)
    assert result.registration_enabled is False

    monkeypatch.setattr(settings, "allow_public_registration", True)
    result = await get_public_auth_config(db_session)
    assert result.registration_enabled is True

    org.registration_enabled = False
    db_session.commit()
    result = await get_public_auth_config(db_session)
    assert result.registration_enabled is False


@pytest.mark.asyncio
async def test_register_bootstraps_first_org_admin(db_session, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    monkeypatch.setattr(limiter, "enabled", False)
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/register", "headers": []})
    body = UserCreate(username="founder", email="founder@example.com", password="password123")

    result = await register_user(request, body, BackgroundTasks(), db_session)
    assert result.status == "verified"

    user = db_session.query(User).filter(User.username == "founder").first()
    assert user is not None
    assert user.is_admin is True
    assert user.org_id is not None
    membership = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == user.id).first()
    assert membership is not None
    assert membership.role == "org_admin"
    assert membership.invite_status == InviteStatus.ACCEPTED


@pytest.mark.asyncio
async def test_register_rejects_non_invite_after_bootstrap(db_session, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    monkeypatch.setattr(settings, "allow_public_registration", False)
    monkeypatch.setattr(limiter, "enabled", False)
    request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/register", "headers": []})
    await register_user(
        request,
        UserCreate(username="founder", email="founder@example.com", password="password123"),
        BackgroundTasks(),
        db_session,
    )

    with pytest.raises(HTTPException) as exc:
        await register_user(
            request,
            UserCreate(username="another", email="another@example.com", password="password123"),
            BackgroundTasks(),
            db_session,
        )
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_register_allows_public_signup_when_enabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    monkeypatch.setattr(settings, "allow_public_registration", True)
    monkeypatch.setattr(limiter, "enabled", False)
    now = datetime.now(timezone.utc)
    org = Organization(name="Default", slug="default", registration_enabled=True)
    db_session.add(org)
    db_session.flush()
    admin = User(
        username="admin",
        email="admin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    db_session.add(admin)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=admin.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
            joined_at=now,
        )
    )
    db_session.commit()

    request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/register", "headers": []})
    result = await register_user(
        request,
        UserCreate(username="newmember", email="newmember@example.com", password="password123"),
        BackgroundTasks(),
        db_session,
    )
    assert result.status == "verified"
    user = db_session.query(User).filter(User.username == "newmember").first()
    membership = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == user.id).first()
    assert user.org_id == org.id
    assert user.is_admin is False
    assert membership.role == "member"
    assert membership.invite_status == InviteStatus.ACCEPTED


@pytest.mark.asyncio
async def test_register_rejects_pending_invite(db_session, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    monkeypatch.setattr(limiter, "enabled", False)
    now = datetime.now(timezone.utc)
    org = Organization(name="Default", slug="default", registration_enabled=False)
    db_session.add(org)
    db_session.flush()
    admin = User(
        username="admin",
        email="admin@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    invited = User(
        username="invitee",
        email="invitee@example.com",
        hashed_password="x" * 60,
        is_active=False,
        is_admin=False,
        org_id=org.id,
        email_verified_at=None,
    )
    db_session.add_all([admin, invited])
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=admin.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
            joined_at=now,
        )
    )
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=invited.id,
            role="member",
            is_active=False,
            invited_by=admin.id,
            invite_status=InviteStatus.PENDING,
            invite_expires_at=now + timedelta(minutes=30),
        )
    )
    db_session.commit()

    request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/register", "headers": []})
    with pytest.raises(HTTPException) as exc:
        await register_user(
            request,
            UserCreate(username="invitee", email="invitee@example.com", password="newsecure123"),
            BackgroundTasks(),
            db_session,
        )
    assert exc.value.status_code == 403
    assert "invitation email" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_register_pending_invite_requires_verification_when_enabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", False)
    monkeypatch.setattr(limiter, "enabled", False)
    now = datetime.now(timezone.utc)
    org = Organization(name="Default", slug="default", registration_enabled=False)
    db_session.add(org)
    db_session.flush()
    admin = User(
        username="admin2",
        email="admin2@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=now,
    )
    invited = User(
        username="invitee2",
        email="invitee2@example.com",
        hashed_password="x" * 60,
        is_active=False,
        is_admin=False,
        org_id=org.id,
        email_verified_at=None,
    )
    db_session.add_all([admin, invited])
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=admin.id,
            role="org_admin",
            is_active=True,
            invite_status=InviteStatus.ACCEPTED,
            joined_at=now,
        )
    )
    db_session.add(
        OrganizationMember(
            org_id=org.id,
            user_id=invited.id,
            role="member",
            is_active=False,
            invited_by=admin.id,
            invite_status=InviteStatus.PENDING,
            invite_expires_at=now,
        )
    )
    db_session.commit()

    request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/register", "headers": []})
    with pytest.raises(HTTPException) as exc:
        await register_user(
            request,
            UserCreate(username="invitee2", email="invitee2@example.com", password="newsecure123"),
            BackgroundTasks(),
            db_session,
        )

    assert exc.value.status_code == 403
