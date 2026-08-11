"""Gmail OAuth redirect validation and /connectors/gmail compatibility routes."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routes.gmail import _validate_gmail_oauth_redirect_uri


@pytest.mark.parametrize(
    "redirect_uri",
    [
        "http://localhost:9090/api/v1/gmail/auth/callback",
        "https://example.ngrok-free.dev/api/v1/connectors/gmail/auth/callback",
    ],
)
def test_validate_gmail_oauth_redirect_uri_accepts_legacy_and_connector_paths(redirect_uri: str):
    _validate_gmail_oauth_redirect_uri(redirect_uri)


def test_validate_gmail_oauth_redirect_uri_rejects_unrelated_path():
    with pytest.raises(HTTPException) as exc:
        _validate_gmail_oauth_redirect_uri("https://example.com/api/v1/connectors/notion/auth/callback")
    assert exc.value.status_code == 400


def test_connectors_gmail_auth_callback_route_registered():
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)
    response = client.get("/api/v1/connectors/gmail/auth/callback?code=x&state=y")
    assert response.status_code != 404
