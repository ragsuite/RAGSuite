"""Org invite setup flow: temp password, expiry, and first-login password change."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi import BackgroundTasks, HTTPException, Request
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.auth import get_password_hash
from app.models import Base, InviteStatus, Organization, OrganizationMember, User
from app.routes.crawl import login_user
from app.routes.organization import (
    complete_invite_setup,
    create_org_user,
    preview_invite_setup,
)
from app.schemas import InviteSetupCompleteIn, OrgUserCreate, OrganizationRole, UserLogin
from app.settings import settings
from app.limiter import limiter

pytestmark = pytest.mark.ee


INVITE_TOKEN = "fixed-invite-token-for-tests"
TEMP_PASSWORD = "TempPass12345678"


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
        engine.dispose()


@pytest.fixture
def invite_fixtures(db_session, monkeypatch):
    monkeypatch.setattr(limiter, "enabled", False)
    now = datetime.now(timezone.utc)
    org = db_session.query(Organization).first()
    if not org:
        org = Organization(name="Acme", slug="acme", registration_enabled=False)
        db_session.add(org)
        db_session.flush()
    admin = db_session.query(User).filter(User.username == "admin").first()
    if not admin:
        admin = User(
            username="admin",
            email="admin@acme.com",
            hashed_password=get_password_hash("adminpass"),
            is_active=True,
            is_admin=True,
            org_id=org.id,
            email_verified_at=now,
        )
        db_session.add(admin)
        db_session.flush()
    membership = (
        db_session.query(OrganizationMember)
        .filter(OrganizationMember.org_id == org.id, OrganizationMember.user_id == admin.id)
        .first()
    )
    if not membership:
        db_session.add(
            OrganizationMember(
                org_id=org.id,
                user_id=admin.id,
                role="org_admin",
                is_active=True,
                invite_status=InviteStatus.ACCEPTED,
            )
        )
        db_session.flush()
    return org, admin


@pytest.mark.asyncio
async def test_create_org_user_invite_link_points_to_setup_page(db_session, invite_fixtures):
    _, admin = invite_fixtures
    request = MagicMock()
    request.headers = {"origin": "http://localhost:9091"}
    payload = OrgUserCreate(
        username="setup_link_user",
        email="setup_link_user@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=True,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value=INVITE_TOKEN):
        with patch("app.routes.organization.generate_temp_password", return_value=TEMP_PASSWORD):
            with patch("app.routes.organization.smtp_configured", return_value=True):
                with patch("app.routes.organization.send_org_invite_email") as invite_mock:
                    await create_org_user(payload, request, current_admin=admin, db=db_session)
    kwargs = invite_mock.call_args.kwargs
    assert kwargs["setup_url"] == f"http://localhost:9091/sign-in?invite={INVITE_TOKEN}"
    assert kwargs["username"] == "setup_link_user"
    assert kwargs["temporary_password"] == TEMP_PASSWORD
    assert kwargs["expires_minutes"] == settings.org_invite_temp_password_ttl_minutes


@pytest.mark.asyncio
async def test_create_org_user_skips_email_when_flag_false(db_session, invite_fixtures):
    _, admin = invite_fixtures
    request = MagicMock()
    payload = OrgUserCreate(
        username="no_email_user",
        email="no_email_user@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.smtp_configured", return_value=True):
        with patch("app.routes.organization.send_org_invite_email") as invite_mock:
            await create_org_user(payload, request, current_admin=admin, db=db_session)
    assert not invite_mock.called


@pytest.mark.asyncio
async def test_preview_invite_setup_returns_user_details(db_session, invite_fixtures):
    _, admin = invite_fixtures
    request = MagicMock()
    payload = OrgUserCreate(
        username="preview_user",
        email="preview_user@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value=INVITE_TOKEN):
        with patch("app.routes.organization.generate_temp_password", return_value=TEMP_PASSWORD):
            await create_org_user(payload, request, current_admin=admin, db=db_session)

    preview = await preview_invite_setup(token=INVITE_TOKEN, db=db_session)
    assert preview.username == "preview_user"
    assert preview.email == "preview_user@acme.com"
    assert preview.expired is False


@pytest.mark.asyncio
async def test_preview_invite_setup_rejects_expired_invite(db_session, invite_fixtures):
    _, admin = invite_fixtures
    request = MagicMock()
    payload = OrgUserCreate(
        username="expired_user",
        email="expired_user@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value=INVITE_TOKEN):
        with patch("app.routes.organization.generate_temp_password", return_value=TEMP_PASSWORD):
            await create_org_user(payload, request, current_admin=admin, db=db_session)

    membership = (
        db_session.query(OrganizationMember)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(User.username == "expired_user")
        .first()
    )
    membership.invite_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    with pytest.raises(HTTPException) as exc:
        await preview_invite_setup(token=INVITE_TOKEN, db=db_session)
    assert exc.value.status_code == 410


@pytest.mark.asyncio
async def test_complete_invite_setup_activates_user_and_returns_session(db_session, invite_fixtures, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    _, admin = invite_fixtures
    request = MagicMock()
    request.headers = {"user-agent": "pytest", "host": "testserver"}
    request.url.scheme = "http"
    request.url.hostname = "testserver"
    payload = OrgUserCreate(
        username="complete_user",
        email="complete_user@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value=INVITE_TOKEN):
        with patch("app.routes.organization.generate_temp_password", return_value=TEMP_PASSWORD):
            await create_org_user(payload, request, current_admin=admin, db=db_session)

    http_request = Request({"type": "http", "method": "POST", "path": "/api/v1/org/invite/setup", "headers": []})
    response = await complete_invite_setup(
        InviteSetupCompleteIn(
            token=INVITE_TOKEN,
            username="complete_user",
            current_password=TEMP_PASSWORD,
            new_password="NewSecure123!",
            confirm_password="NewSecure123!",
        ),
        http_request,
        BackgroundTasks(),
        db_session,
    )
    body = response.body.decode("utf-8")
    assert "access_token" in body
    assert "redirect_path" in body

    user = db_session.query(User).filter(User.username == "complete_user").first()
    membership = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == user.id).first()
    assert user.is_active is True
    assert user.onboarding_completed_at is not None
    assert membership.invite_status == InviteStatus.ACCEPTED
    assert membership.invite_token_hash is None
    assert membership.invite_expires_at is None


@pytest.mark.asyncio
async def test_login_rejects_pending_invite_before_setup(db_session, invite_fixtures, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    _, admin = invite_fixtures
    request = MagicMock()
    payload = OrgUserCreate(
        username="login_pending",
        email="login_pending@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value=INVITE_TOKEN):
        with patch("app.routes.organization.generate_temp_password", return_value=TEMP_PASSWORD):
            await create_org_user(payload, request, current_admin=admin, db=db_session)

    login_request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/login", "headers": []})
    with pytest.raises(HTTPException) as exc:
        await login_user(
            login_request,
            UserLogin(username="login_pending", password=TEMP_PASSWORD),
            BackgroundTasks(),
            db_session,
        )
    assert exc.value.status_code == 403
    assert "invitation email" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_login_rejects_expired_invite(db_session, invite_fixtures, monkeypatch):
    monkeypatch.setattr(settings, "disable_email_verification", True)
    _, admin = invite_fixtures
    request = MagicMock()
    payload = OrgUserCreate(
        username="login_expired",
        email="login_expired@acme.com",
        role=OrganizationRole.MEMBER,
        send_invite_email=False,
        project_assignments=[],
    )
    with patch("app.routes.organization.secrets.token_urlsafe", return_value=INVITE_TOKEN):
        with patch("app.routes.organization.generate_temp_password", return_value=TEMP_PASSWORD):
            await create_org_user(payload, request, current_admin=admin, db=db_session)

    membership = (
        db_session.query(OrganizationMember)
        .join(User, User.id == OrganizationMember.user_id)
        .filter(User.username == "login_expired")
        .first()
    )
    membership.invite_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.commit()

    login_request = Request({"type": "http", "method": "POST", "path": "/api/v1/crawl/auth/login", "headers": []})
    with pytest.raises(HTTPException) as exc:
        await login_user(
            login_request,
            UserLogin(username="login_expired", password=TEMP_PASSWORD),
            BackgroundTasks(),
            db_session,
        )
    assert exc.value.status_code == 403
    assert "expired" in str(exc.value.detail).lower()
