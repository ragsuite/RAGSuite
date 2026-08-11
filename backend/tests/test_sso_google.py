"""Google SSO tests — admin-safe guarantees and JIT-off behavior."""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import types

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.models import (
    Base,
    InviteStatus,
    Organization,
    OrganizationMember,
    OrganizationSsoConfig,
    User,
    UserIdpIdentity,
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
from app.routes.auth_sso import discover_sso, sso_callback, start_sso
from app.schemas import OrgSsoConfigUpdate, OrganizationRole
from app.services.sso.google_oidc import sso_callback_url
from app.services.sso.resolve_user import SsoUserResolutionError, resolve_sso_user
from app.settings import settings

pytestmark = pytest.mark.ee


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    org = Organization(name="Acme", slug="acme", registration_enabled=False)
    session.add(org)
    session.flush()

    admin = User(
        username="admin",
        email="admin@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    member = User(
        username="member",
        email="member@acme.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add_all([admin, member])
    session.flush()
    session.add_all(
        [
            OrganizationMember(org_id=org.id, user_id=admin.id, role="org_admin", is_active=True),
            OrganizationMember(org_id=org.id, user_id=member.id, role="member", is_active=True),
        ]
    )
    session.add(
        OrganizationSsoConfig(
            org_id=org.id,
            enabled=True,
            provider="google",
            client_id="google-client",
            client_secret_encrypted="enc-secret",
            email_domains=["acme.com"],
            jit_provisioning_enabled=False,
            default_role="member",
        )
    )
    session.commit()
    yield session
    session.close()


def test_resolve_sso_user_rejects_unknown_email(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    with pytest.raises(SsoUserResolutionError) as exc:
        resolve_sso_user(
            db_session,
            org_id=config.org_id,
            config=config,
            idp_subject="google-sub-unknown",
            email="unknown@acme.com",
            email_verified=True,
        )
    assert exc.value.status_code == 403


def test_resolve_sso_user_allows_jit_member_when_enabled(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    config.jit_provisioning_enabled = True
    db_session.commit()

    user, membership, linked = resolve_sso_user(
        db_session,
        org_id=config.org_id,
        config=config,
        idp_subject="google-sub-jit-member",
        email="new-member@acme.com",
        email_verified=True,
    )
    db_session.commit()

    assert linked is True
    assert user.is_admin is False
    assert membership.role == "member"


def test_resolve_sso_user_bootstraps_first_admin_when_none_exists(db_session):
    org = db_session.query(Organization).first()
    db_session.query(OrganizationMember).delete()
    db_session.query(User).delete()
    db_session.commit()
    config = db_session.query(OrganizationSsoConfig).first()
    user, membership, linked = resolve_sso_user(
        db_session,
        org_id=org.id,
        config=config,
        idp_subject="google-first-admin",
        email="firstadmin@acme.com",
        email_verified=True,
    )
    db_session.commit()
    assert linked is True
    assert user.is_admin is True
    assert membership.role == "org_admin"


def test_resolve_sso_user_links_member_without_changing_role(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    user, membership, _linked = resolve_sso_user(
        db_session,
        org_id=config.org_id,
        config=config,
        idp_subject="google-sub-member",
        email="member@acme.com",
        email_verified=True,
    )
    db_session.commit()

    assert membership.role == "member"
    assert user.is_admin is False
    identity = db_session.query(UserIdpIdentity).filter(UserIdpIdentity.user_id == user.id).first()
    assert identity is not None
    assert identity.idp_subject == "google-sub-member"


def test_resolve_sso_user_keeps_existing_org_admin_role(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    user, membership, _linked = resolve_sso_user(
        db_session,
        org_id=config.org_id,
        config=config,
        idp_subject="google-sub-admin",
        email="admin@acme.com",
        email_verified=True,
    )
    db_session.commit()

    assert membership.role == "org_admin"
    assert user.is_admin is True


def test_resolve_sso_user_syncs_stale_is_admin_from_membership(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    admin = db_session.query(User).filter(User.email == "admin@acme.com").first()
    admin.is_admin = False
    db_session.commit()

    user, membership, _linked = resolve_sso_user(
        db_session,
        org_id=config.org_id,
        config=config,
        idp_subject="google-sub-admin-stale",
        email="admin@acme.com",
        email_verified=True,
    )
    db_session.commit()

    assert membership.role == "org_admin"
    assert user.is_admin is True


def test_resolve_sso_user_rejects_revoked_member(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    member = db_session.query(User).filter(User.email == "member@acme.com").first()
    membership = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == member.id).first()
    membership.invite_status = InviteStatus.REVOKED
    db_session.commit()

    with pytest.raises(SsoUserResolutionError) as exc:
        resolve_sso_user(
            db_session,
            org_id=config.org_id,
            config=config,
            idp_subject="google-sub-member",
            email="member@acme.com",
            email_verified=True,
        )
    assert exc.value.status_code == 403


def test_resolve_sso_user_rejects_allowed_domain_without_team_member(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    config.email_domains = ["gmail.com", "mail.nitsan.ai"]
    db_session.commit()

    with pytest.raises(SsoUserResolutionError) as exc:
        resolve_sso_user(
            db_session,
            org_id=config.org_id,
            config=config,
            idp_subject="google-outsider",
            email="outsider@gmail.com",
            email_verified=True,
        )
    assert exc.value.status_code == 403
    assert exc.value.detail == "Account not provisioned"


def test_resolve_sso_user_blocks_deactivated_member(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    member = db_session.query(User).filter(User.email == "member@acme.com").first()
    membership = db_session.query(OrganizationMember).filter(OrganizationMember.user_id == member.id).first()
    member.is_active = False
    membership.is_active = False
    db_session.commit()

    with pytest.raises(SsoUserResolutionError) as exc:
        resolve_sso_user(
            db_session,
            org_id=config.org_id,
            config=config,
            idp_subject="google-sub-member",
            email="member@acme.com",
            email_verified=True,
        )
    assert exc.value.status_code == 403


def test_resolve_sso_user_activates_pending_invite(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    invited = User(
        username="pending-sso",
        email="pending-sso@acme.com",
        hashed_password="x" * 60,
        is_active=False,
        is_admin=False,
        org_id=config.org_id,
        email_verified_at=None,
    )
    db_session.add(invited)
    db_session.flush()
    db_session.add(
        OrganizationMember(
            org_id=config.org_id,
            user_id=invited.id,
            role="member",
            is_active=False,
            invite_status=InviteStatus.PENDING,
        )
    )
    db_session.commit()

    user, membership, linked = resolve_sso_user(
        db_session,
        org_id=config.org_id,
        config=config,
        idp_subject="google-sub-pending",
        email="pending-sso@acme.com",
        email_verified=True,
    )
    db_session.commit()
    assert linked is True
    assert user.is_active is True
    assert membership.is_active is True
    assert membership.invite_status.value == "accepted"


def test_org_sso_config_update_rejects_org_admin_default_role():
    with pytest.raises(ValidationError):
        OrgSsoConfigUpdate(
            enabled=True,
            client_id="id",
            client_secret="secret",
            email_domains=["acme.com"],
            default_role=OrganizationRole.ORG_ADMIN,
        )

@pytest.mark.asyncio
async def test_discover_sso_by_email_domain(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    result = await discover_sso(email="member@acme.com", db=db_session)
    assert result.sso_enabled is True
    assert result.org_slug == "acme"
    assert result.provider == "google"


@pytest.mark.asyncio
async def test_discover_sso_by_exact_email_entry(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    config = db_session.query(OrganizationSsoConfig).first()
    config.email_domains = ["member@acme.com"]
    db_session.commit()

    result = await discover_sso(email="member@acme.com", db=db_session)
    assert result.sso_enabled is True
    assert result.org_slug == "acme"
    assert result.provider == "google"


@pytest.mark.asyncio
async def test_start_sso_redirects_when_enabled(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    scope = {"type": "http", "headers": [(b"origin", b"http://localhost:9091")]}
    request = Request(scope)
    with patch("app.routes.auth_sso.create_sso_state", return_value=("state123", "nonce123", "verifier123")):
        with patch(
            "app.routes.auth_sso.build_authorize_url",
            return_value="https://accounts.google.com/o/oauth2/v2/auth?state=state123",
        ):
            response = await start_sso(request=request, org_slug="acme", db=db_session)
    assert response.status_code == 302
    assert "accounts.google.com" in response.headers["location"]


@pytest.mark.asyncio
async def test_start_sso_returns_json_when_accept_json(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    scope = {
        "type": "http",
        "headers": [
            (b"origin", b"http://localhost:9091"),
            (b"accept", b"application/json"),
        ],
    }
    request = Request(scope)
    with patch("app.routes.auth_sso.create_sso_state", return_value=("state123", "nonce123", "verifier123")):
        with patch(
            "app.routes.auth_sso.build_authorize_url",
            return_value="https://accounts.google.com/o/oauth2/v2/auth?state=state123",
        ):
            response = await start_sso(request=request, org_slug="acme", db=db_session)
    assert response.authorize_url == "https://accounts.google.com/o/oauth2/v2/auth?state=state123"


@pytest.mark.asyncio
async def test_start_sso_disabled_globally(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", False)
    scope = {"type": "http", "headers": []}
    request = Request(scope)
    with pytest.raises(HTTPException) as exc:
        await start_sso(request=request, org_slug="acme", db=db_session)
    assert exc.value.status_code == 404


def test_sso_callback_url_uses_base_host(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "https://api.example.com")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    assert sso_callback_url() == "https://api.example.com/api/v1/auth/sso/callback"


def test_sso_callback_url_keeps_full_callback_url(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "https://api.example.com/api/v1/auth/sso/callback")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    assert sso_callback_url() == "https://api.example.com/api/v1/auth/sso/callback"


def test_sso_callback_url_prefers_ngrok_request_over_localhost_env(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "http://localhost:9090")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    scope = {
        "type": "http",
        "headers": [
            (b"x-forwarded-proto", b"https"),
            (b"x-forwarded-host", b"carried-habitual-outright.ngrok-free.dev"),
        ],
        "scheme": "http",
        "server": ("localhost", 8002),
        "path": "/api/v1/auth/sso/start",
        "query_string": b"",
    }
    request = Request(scope)
    assert (
        sso_callback_url(request)
        == "https://carried-habitual-outright.ngrok-free.dev/api/v1/auth/sso/callback"
    )


def test_sso_callback_url_uses_forwarded_host_from_request(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    scope = {
        "type": "http",
        "headers": [
            (b"x-forwarded-proto", b"https"),
            (b"x-forwarded-host", b"carried-habitual-outright.ngrok-free.dev"),
        ],
        "scheme": "http",
        "server": ("localhost", 8002),
        "path": "/api/v1/auth/sso/start",
        "query_string": b"",
    }
    request = Request(scope)
    assert (
        sso_callback_url(request)
        == "https://carried-habitual-outright.ngrok-free.dev/api/v1/auth/sso/callback"
    )


@pytest.mark.asyncio
async def test_start_sso_stores_frontend_origin_in_state(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:9091")
    scope = {"type": "http", "headers": [(b"origin", b"http://localhost:9091")]}
    request = Request(scope)
    with patch("app.routes.auth_sso.create_sso_state", return_value=("state123", "nonce123", "verifier123")) as state_mock:
        with patch(
            "app.routes.auth_sso.build_authorize_url",
            return_value="https://accounts.google.com/o/oauth2/v2/auth?state=state123",
        ):
            await start_sso(request=request, org_slug="acme", db=db_session)
    state_mock.assert_called_once_with(
        1,
        "acme",
        frontend_base_url="http://localhost:9091",
        redirect_uri=sso_callback_url(request),
    )


@pytest.mark.asyncio
async def test_start_sso_drops_untrusted_origin_from_state(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:9091")
    scope = {"type": "http", "headers": [(b"origin", b"https://evil.example")]}
    request = Request(scope)
    with patch("app.routes.auth_sso.create_sso_state", return_value=("state123", "nonce123", "verifier123")) as state_mock:
        with patch(
            "app.routes.auth_sso.build_authorize_url",
            return_value="https://accounts.google.com/o/oauth2/v2/auth?state=state123",
        ):
            await start_sso(request=request, org_slug="acme", db=db_session)
    state_mock.assert_called_once_with(
        1,
        "acme",
        frontend_base_url=None,
        redirect_uri=sso_callback_url(request),
    )


@pytest.mark.asyncio
async def test_sso_callback_handles_missing_state_without_unbound_local(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    scope = {"type": "http", "headers": []}
    request = Request(scope)

    with patch("app.routes.auth_sso.consume_sso_state", side_effect=HTTPException(status_code=400, detail="Invalid state")):
        response = await sso_callback(
            request=request,
            background_tasks=MagicMock(),
            code="dummy-code",
            state="dummy-state",
            error=None,
            db=db_session,
        )

    assert response.status_code == 302
    assert "success=0" in response.headers["location"]


def test_resolve_sso_user_accepts_exact_email_allow_entry(db_session):
    config = db_session.query(OrganizationSsoConfig).first()
    config.email_domains = ["member@acme.com"]
    db_session.commit()

    user, membership, _linked = resolve_sso_user(
        db_session,
        org_id=config.org_id,
        config=config,
        idp_subject="google-sub-member-exact-email",
        email="member@acme.com",
        email_verified=True,
    )
    db_session.commit()
    assert user.email == "member@acme.com"
    assert membership.role == "member"
