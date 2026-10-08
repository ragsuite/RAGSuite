"""Microsoft Entra SSO unit tests — adapter, enable validation, discover/start."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import types

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

from app.models import (
    Base,
    Organization,
    OrganizationMember,
    OrganizationSsoConfig,
    User,
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
from app.routes.auth_sso import discover_sso, start_sso
from app.settings import settings

pytestmark = pytest.mark.ee


def _mock_async_client(*, get_responses, post_response=None):
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=get_responses)
    if post_response is not None:
        mock_client.post = AsyncMock(return_value=post_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    return mock_client


def _json_response(status_code: int, payload: dict) -> MagicMock:
    response = MagicMock()
    response.status_code = status_code
    response.json.return_value = payload
    return response


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
    session.add(admin)
    session.flush()
    session.add(OrganizationMember(org_id=org.id, user_id=admin.id, role="org_admin", is_active=True))
    session.add(
        OrganizationSsoConfig(
            org_id=org.id,
            enabled=True,
            provider="microsoft",
            tenant_id="11111111-2222-3333-4444-555555555555",
            client_id="ms-client",
            client_secret_encrypted="enc-secret",
            email_domains=["acme.com"],
            jit_provisioning_enabled=False,
            default_role="member",
        )
    )
    session.commit()
    yield session
    session.close()


def test_apply_microsoft_defaults_sets_entra_urls():
    from app.services.sso.microsoft_oidc import apply_microsoft_defaults

    config = OrganizationSsoConfig(
        org_id=1,
        provider="microsoft",
        tenant_id="contoso-tenant",
    )
    apply_microsoft_defaults(config)
    assert config.provider == "microsoft"
    assert "contoso-tenant" in (config.authorization_url or "")
    assert "contoso-tenant" in (config.token_url or "")
    assert config.idp_entity_id == "https://login.microsoftonline.com/contoso-tenant/v2.0"


def test_build_authorize_url_defaults_empty_tenant_to_organizations():
    from app.services.sso.microsoft_oidc import build_authorize_url

    config = OrganizationSsoConfig(
        org_id=1,
        provider="microsoft",
        tenant_id="",
        client_id="ms-client",
    )
    url = build_authorize_url(
        config,
        state="s",
        nonce="n",
        code_verifier="v",
        redirect_uri="https://api.example.com/api/v1/auth/sso/callback",
    )
    assert "login.microsoftonline.com/organizations/" in url
    assert "client_id=ms-client" in url


def test_build_authorize_url_uses_common_for_directory_guid():
    from app.services.sso.microsoft_oidc import build_authorize_url

    config = OrganizationSsoConfig(
        org_id=1,
        provider="microsoft",
        tenant_id="452aa081-6852-4451-9e72-6b64c659fa28",
        client_id="ms-client",
    )
    url = build_authorize_url(
        config,
        state="s",
        nonce="n",
        code_verifier="v",
        redirect_uri="https://api.example.com/api/v1/auth/sso/callback",
    )
    assert "login.microsoftonline.com/common/" in url
    assert "452aa081-6852-4451-9e72-6b64c659fa28" not in url.split("?")[0]


def test_build_authorize_url_requires_client_id():
    from app.services.sso.microsoft_oidc import build_authorize_url

    config = OrganizationSsoConfig(
        org_id=1,
        provider="microsoft",
        tenant_id="tenant-guid",
        client_id=None,
    )
    with pytest.raises(HTTPException) as exc:
        build_authorize_url(
            config,
            state="s",
            nonce="n",
            code_verifier="v",
            redirect_uri="https://api.example.com/api/v1/auth/sso/callback",
        )
    assert exc.value.status_code == 400


def test_extract_email_from_claims_prefers_email_then_upn():
    from app.services.sso.microsoft_oidc import extract_email_from_claims

    assert extract_email_from_claims({"email": "a@acme.com"}) == "a@acme.com"
    assert extract_email_from_claims({"preferred_username": "b@acme.com"}) == "b@acme.com"
    assert extract_email_from_claims({"preferred_username": "not-an-email"}) is None


@pytest.mark.asyncio
async def test_microsoft_connectivity_invalid_client_fails():
    from app.services.sso.microsoft_oidc import test_microsoft_connectivity

    config = OrganizationSsoConfig(
        org_id=1,
        enabled=True,
        provider="microsoft",
        tenant_id="tenant-guid",
        client_id="saved-client",
        client_secret_encrypted="enc",
    )
    discovery = _json_response(
        200,
        {"issuer": "https://login.microsoftonline.com/tenant-guid/v2.0"},
    )
    jwks = _json_response(200, {"keys": [{"kid": "1"}]})
    token = _json_response(401, {"error": "invalid_client", "error_description": "AADSTS7000215"})
    mock_client = _mock_async_client(get_responses=[discovery, jwks], post_response=token)

    with patch(
        "ragsuite_modules.sso.backend.sso_lib.microsoft_oidc.httpx.AsyncClient",
        return_value=mock_client,
    ):
        ok, message, issuer = await test_microsoft_connectivity(
            config,
            tenant_id="tenant-guid",
            client_id="bad-client",
            client_secret="bad-secret",
            redirect_uri="http://localhost/api/v1/auth/sso/callback",
        )

    assert ok is False
    assert "rejected" in message.lower()
    assert issuer == "https://login.microsoftonline.com/tenant-guid/v2.0"


@pytest.mark.asyncio
async def test_microsoft_connectivity_invalid_grant_passes():
    from app.services.sso.microsoft_oidc import test_microsoft_connectivity

    config = OrganizationSsoConfig(
        org_id=1,
        enabled=True,
        provider="microsoft",
        tenant_id="tenant-guid",
        client_id="saved-client",
        client_secret_encrypted="enc",
    )
    discovery = _json_response(
        200,
        {"issuer": "https://login.microsoftonline.com/tenant-guid/v2.0"},
    )
    jwks = _json_response(200, {"keys": [{"kid": "1"}]})
    token = _json_response(400, {"error": "invalid_grant"})
    mock_client = _mock_async_client(get_responses=[discovery, jwks], post_response=token)

    with patch(
        "ragsuite_modules.sso.backend.sso_lib.microsoft_oidc.httpx.AsyncClient",
        return_value=mock_client,
    ):
        ok, message, issuer = await test_microsoft_connectivity(
            config,
            client_id="good-client",
            client_secret="good-secret",
            redirect_uri="http://localhost/api/v1/auth/sso/callback",
        )

    assert ok is True
    assert "accepted the client credentials" in message


@pytest.mark.asyncio
async def test_microsoft_connectivity_requires_tenant_id():
    from app.services.sso.microsoft_oidc import test_microsoft_connectivity

    ok, message, issuer = await test_microsoft_connectivity(
        None,
        client_id="c",
        client_secret="s",
    )
    assert ok is False
    assert message == "tenant_id is required"
    assert issuer is None


@pytest.mark.asyncio
async def test_discover_includes_microsoft_provider(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    result = await discover_sso(email="admin@acme.com", db=db_session)
    assert result.sso_enabled is True
    assert result.org_slug == "acme"
    assert result.provider == "microsoft"
    assert result.providers == ["microsoft"]


@pytest.mark.asyncio
async def test_discover_lists_both_providers(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    org = db_session.query(Organization).first()
    db_session.add(
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
    db_session.commit()

    result = await discover_sso(email="admin@acme.com", db=db_session)
    assert result.sso_enabled is True
    assert result.provider == "google"
    assert result.providers == ["google", "microsoft"]


@pytest.mark.asyncio
async def test_start_sso_microsoft_provider(db_session, monkeypatch):
    monkeypatch.setattr(settings, "sso_enabled", True)
    scope = {"type": "http", "headers": [(b"accept", b"application/json")]}
    request = Request(scope)
    with patch("ragsuite_modules.sso.backend.auth_routes.create_sso_state", return_value=("state123", "nonce123", "verifier123")) as state_mock:
        with patch(
            "ragsuite_modules.sso.backend.sso_lib.microsoft_oidc.build_authorize_url",
            return_value="https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize?state=state123",
        ):
            response = await start_sso(
                request=request,
                org_slug="acme",
                provider="microsoft",
                db=db_session,
            )
    assert response.authorize_url.startswith("https://login.microsoftonline.com/")
    assert state_mock.call_args.kwargs.get("provider") == "microsoft"


def test_sso_test_result_code_maps_user_facing_failures():
    from ragsuite_modules.organization.backend.routes import _sso_test_result_code

    assert _sso_test_result_code(False, "tenant_id is required") == "missing_tenant_id"
    assert _sso_test_result_code(False, "client_id is required") == "missing_client_id"
    assert _sso_test_result_code(False, "Microsoft rejected the client ID") == "invalid_credentials"
    assert _sso_test_result_code(True, "Microsoft accepted the client credentials") == "credentials_ok"
