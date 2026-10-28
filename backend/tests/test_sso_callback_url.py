"""SSO callback URL is built from server config, never from forwarded Host."""

import pytest
from starlette.requests import Request

pytestmark = pytest.mark.ee

from app.services.sso.google_oidc import sso_callback_url
from app.settings import settings


def test_sso_callback_url_uses_base_host(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "https://api.example.com")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    assert sso_callback_url() == "https://api.example.com/api/v1/auth/sso/callback"


def test_sso_callback_url_keeps_full_callback_url(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "https://api.example.com/api/v1/auth/sso/callback")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    assert sso_callback_url() == "https://api.example.com/api/v1/auth/sso/callback"


def _forwarded_request() -> Request:
    return Request(
        {
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
    )


def test_sso_callback_url_ignores_forwarded_host_when_env_is_localhost(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "http://localhost:9090")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    assert sso_callback_url(_forwarded_request()) == "http://localhost:9090/api/v1/auth/sso/callback"


def test_sso_callback_url_ignores_forwarded_host_when_env_empty(monkeypatch):
    monkeypatch.setattr(settings, "sso_callback_base_url", "")
    monkeypatch.setattr(settings, "public_api_base_url", "")
    url = sso_callback_url(_forwarded_request())
    assert url == f"{settings.public_api_origin()}/api/v1/auth/sso/callback"
    assert "ngrok" not in url
