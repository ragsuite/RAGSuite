"""Unit tests for Google SSO Test connection credential probing."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import OrganizationSsoConfig

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


@pytest.mark.asyncio
async def test_google_connectivity_invalid_client_fails():
    from app.services.sso.google_oidc import test_google_connectivity

    config = OrganizationSsoConfig(
        org_id=1,
        enabled=True,
        provider="google",
        client_id="saved-client",
        client_secret_encrypted="enc",
    )
    discovery = _json_response(200, {"issuer": "https://accounts.google.com"})
    jwks = _json_response(200, {"keys": [{"kid": "1"}]})
    token = _json_response(401, {"error": "invalid_client"})
    mock_client = _mock_async_client(get_responses=[discovery, jwks], post_response=token)

    with patch("ragsuite_modules.sso.backend.sso_lib.google_oidc.httpx.AsyncClient", return_value=mock_client):
        ok, message, issuer = await test_google_connectivity(
            config,
            client_id="bad-client",
            client_secret="bad-secret",
            redirect_uri="http://localhost/api/v1/auth/sso/callback",
        )

    assert ok is False
    assert "client ID or client secret" in message
    assert issuer == "https://accounts.google.com"


@pytest.mark.asyncio
async def test_google_connectivity_invalid_grant_passes():
    from app.services.sso.google_oidc import test_google_connectivity

    config = OrganizationSsoConfig(
        org_id=1,
        enabled=True,
        provider="google",
        client_id="saved-client",
        client_secret_encrypted="enc",
    )
    discovery = _json_response(200, {"issuer": "https://accounts.google.com"})
    jwks = _json_response(200, {"keys": [{"kid": "1"}]})
    token = _json_response(400, {"error": "invalid_grant"})
    mock_client = _mock_async_client(get_responses=[discovery, jwks], post_response=token)

    with patch("ragsuite_modules.sso.backend.sso_lib.google_oidc.httpx.AsyncClient", return_value=mock_client):
        ok, message, issuer = await test_google_connectivity(
            config,
            client_id="good-client",
            client_secret="good-secret",
            redirect_uri="http://localhost/api/v1/auth/sso/callback",
        )

    assert ok is True
    assert "accepted the client credentials" in message
    assert issuer == "https://accounts.google.com"


@pytest.mark.asyncio
async def test_google_connectivity_missing_credentials_fails():
    from app.services.sso.google_oidc import test_google_connectivity

    config = OrganizationSsoConfig(
        org_id=1,
        enabled=True,
        provider="google",
        client_id=None,
        client_secret_encrypted=None,
    )
    discovery = _json_response(200, {"issuer": "https://accounts.google.com"})
    jwks = _json_response(200, {"keys": [{"kid": "1"}]})
    mock_client = _mock_async_client(get_responses=[discovery, jwks])

    with patch("ragsuite_modules.sso.backend.sso_lib.google_oidc.httpx.AsyncClient", return_value=mock_client):
        ok, message, issuer = await test_google_connectivity(config)

    assert ok is False
    assert message == "client_id is required"
    assert issuer == "https://accounts.google.com"


def test_classify_google_token_error():
    from ragsuite_modules.sso.backend.sso_lib.google_oidc import _classify_google_token_error

    assert _classify_google_token_error("invalid_client") == (
        False,
        "Google rejected the client ID or client secret",
    )
    assert _classify_google_token_error("invalid_grant") == (
        True,
        "Google accepted the client credentials",
    )
    assert _classify_google_token_error("redirect_uri_mismatch") == (
        True,
        "Google accepted the client credentials",
    )
    assert _classify_google_token_error("something_else") is None
