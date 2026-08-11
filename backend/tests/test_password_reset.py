"""Password reset request and completion tests."""

from datetime import datetime, timedelta, timezone
import sys
import types

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.auth import get_password_hash
from app.models import (
    Base,
    InviteStatus,
    Organization,
    OrganizationMember,
    User,
)
from app.services.org_invite import hash_invite_token
from app.services.password_reset import (
    PASSWORD_RESET_GENERIC_SENT_MESSAGE,
    PASSWORD_RESET_SMTP_NOT_READY_MESSAGE,
    clear_password_reset_token,
    find_reset_eligible_user_by_email,
    find_user_by_reset_token,
    password_reset_expired,
    user_eligible_for_password_reset,
)


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
from app.routes.crawl import forgot_password, limiter
from app.schemas import ForgotPasswordRequest


@pytest.fixture()
def reset_context():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    now = datetime.now(timezone.utc)
    org = Organization(name="NITSAN", slug="nitsan")
    session.add(org)
    session.flush()

    active_user = User(
        username="member01",
        email="member@yopmail.com",
        hashed_password=get_password_hash("OldPassword123!"),
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=now,
        onboarding_completed_at=now,
    )
    pending_user = User(
        username="pending01",
        email="pending@yopmail.com",
        hashed_password=get_password_hash("TempPassword123!"),
        is_active=False,
        is_admin=False,
        org_id=org.id,
        provisioned_by=1,
    )
    session.add_all([active_user, pending_user])
    session.flush()
    session.add_all(
        [
            OrganizationMember(
                org_id=org.id,
                user_id=active_user.id,
                role="member",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            ),
            OrganizationMember(
                org_id=org.id,
                user_id=pending_user.id,
                role="member",
                is_active=True,
                invite_status=InviteStatus.PENDING,
            ),
        ]
    )
    session.commit()
    yield session, active_user, pending_user
    session.close()


def test_find_reset_eligible_user_by_email_active_only(reset_context):
    session, active_user, _pending = reset_context
    found = find_reset_eligible_user_by_email(session, "member@yopmail.com")
    assert found is not None
    assert found.id == active_user.id
    assert find_reset_eligible_user_by_email(session, "pending@yopmail.com") is None
    assert find_reset_eligible_user_by_email(session, "missing@yopmail.com") is None


def test_password_reset_token_round_trip(reset_context):
    session, active_user, _pending = reset_context
    token = "reset-token-example"
    active_user.password_reset_token_hash = hash_invite_token(token)
    active_user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    session.commit()

    row = find_user_by_reset_token(session, token)
    assert row is not None
    user, membership, org = row
    assert user.id == active_user.id
    assert membership.role == "member"
    assert org.name == "NITSAN"
    assert not password_reset_expired(user)


def test_expired_reset_token_detected(reset_context):
    session, active_user, _pending = reset_context
    active_user.password_reset_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    session.commit()
    assert password_reset_expired(active_user)


def test_user_eligible_for_password_reset(reset_context):
    session, active_user, pending_user = reset_context
    assert user_eligible_for_password_reset(session, active_user)
    assert not user_eligible_for_password_reset(session, pending_user)


def test_clear_password_reset_token(reset_context):
    session, active_user, _pending = reset_context
    active_user.password_reset_token_hash = "abc"
    active_user.password_reset_expires_at = datetime.now(timezone.utc)
    clear_password_reset_token(active_user)
    assert active_user.password_reset_token_hash is None
    assert active_user.password_reset_expires_at is None


def test_generic_message_constant():
    assert "If an account exists" in PASSWORD_RESET_GENERIC_SENT_MESSAGE


def test_smtp_delivery_ready_rejects_smoke_and_placeholders(monkeypatch):
    from app.services import transactional_email as te
    from app.settings import settings

    monkeypatch.setattr(settings, "smtp_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "smtp_user", "smoke-smtp@localhost")
    monkeypatch.setattr(settings, "smtp_password", "ci-smoke-smtp-not-for-production")
    monkeypatch.setattr(settings, "email_from", "smoke-smtp@localhost")
    assert te.smtp_configured() is True
    assert te.smtp_delivery_ready() is False

    monkeypatch.setattr(settings, "smtp_user", "your-smtp-user@example.com")
    monkeypatch.setattr(settings, "smtp_password", "change-me-app-password")
    monkeypatch.setattr(settings, "email_from", "your-smtp-user@example.com")
    assert te.smtp_delivery_ready() is False

    monkeypatch.setattr(settings, "smtp_user", "real@example.com")
    monkeypatch.setattr(settings, "smtp_password", "real-app-password-xyz")
    monkeypatch.setattr(settings, "email_from", "real@example.com")
    assert te.smtp_delivery_ready() is True


@pytest.mark.asyncio
async def test_forgot_password_503_when_smtp_not_delivery_ready(reset_context, monkeypatch):
    session, _active, _pending = reset_context
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr("app.routes.crawl.smtp_delivery_ready", lambda: False)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/crawl/auth/forgot-password",
            "headers": [],
        }
    )
    with pytest.raises(HTTPException) as exc:
        await forgot_password(
            request,
            ForgotPasswordRequest(email="member@yopmail.com"),
            session,
        )
    assert exc.value.status_code == 503
    assert PASSWORD_RESET_SMTP_NOT_READY_MESSAGE in str(exc.value.detail)


@pytest.mark.asyncio
async def test_forgot_password_200_unknown_email_when_smtp_ready(reset_context, monkeypatch):
    session, _active, _pending = reset_context
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr("app.routes.crawl.smtp_delivery_ready", lambda: True)
    send_calls = []

    def _fake_send(**kwargs):
        send_calls.append(kwargs)

    monkeypatch.setattr("app.routes.crawl.send_password_reset_email", _fake_send)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/crawl/auth/forgot-password",
            "headers": [],
        }
    )
    result = await forgot_password(
        request,
        ForgotPasswordRequest(email="nobody@example.com"),
        session,
    )
    assert result.message == PASSWORD_RESET_GENERIC_SENT_MESSAGE
    assert send_calls == []


@pytest.mark.asyncio
async def test_forgot_password_sends_sync_when_user_exists(reset_context, monkeypatch):
    session, active_user, _pending = reset_context
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr("app.routes.crawl.smtp_delivery_ready", lambda: True)
    monkeypatch.setattr("app.routes.crawl.resolve_frontend_base", lambda _req: "http://localhost:9191")
    monkeypatch.setattr("app.routes.crawl.emit_audit", lambda **_kwargs: None)
    send_calls = []

    def _fake_send(**kwargs):
        send_calls.append(kwargs)

    monkeypatch.setattr("app.routes.crawl.send_password_reset_email", _fake_send)
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/crawl/auth/forgot-password",
            "headers": [],
        }
    )
    result = await forgot_password(
        request,
        ForgotPasswordRequest(email=active_user.email),
        session,
    )
    assert result.message == PASSWORD_RESET_GENERIC_SENT_MESSAGE
    assert len(send_calls) == 1
    assert send_calls[0]["to_email"] == active_user.email
    session.refresh(active_user)
    assert active_user.password_reset_token_hash is not None
