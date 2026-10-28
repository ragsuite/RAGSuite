"""Per-hop SSRF fetch: redirects, userinfo stripping, hop cap. No live internal services."""
from __future__ import annotations

from typing import Dict, Tuple, Union
from urllib.parse import urlparse

import httpx
import pytest
from fastapi import HTTPException

from app.platform import safe_http as safe_http_mod
from app.platform.safe_http import (
    TooManyRedirects,
    aiohttp_get_follow,
    httpx_get_follow,
    prepare_hop_url,
    strip_url_userinfo,
)
from app.platform.security_utils import block_ssrf as real_block_ssrf
from app.services.crawler import _playwright_final_url_allowed

Route = Union[bytes, Tuple[int, bytes, Dict[str, str]]]


class _Content:
    def __init__(self, body: bytes):
        self._body = body

    async def iter_chunked(self, size: int):
        for i in range(0, len(self._body), size):
            yield self._body[i : i + size]


class _Response:
    def __init__(self, status: int, body: bytes = b"", headers: Dict[str, str] | None = None):
        self.status = status
        self.headers = headers or {}
        self.content = _Content(body)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class FakeSession:
    def __init__(self, routes: Dict[str, Route]):
        self.routes = routes
        self.requested: list[str] = []

    def get(self, url: str, allow_redirects: bool = True, **_kwargs):
        assert allow_redirects is False, "redirects must be followed manually (SSRF guard per hop)"
        self.requested.append(url)
        route = self.routes.get(url)
        if route is None:
            return _Response(404)
        if isinstance(route, bytes):
            return _Response(200, route)
        status, body, headers = route
        return _Response(status, body, headers)


def _offline_guard(url: str) -> None:
    host = urlparse(url).hostname or ""
    if host.replace(".", "").isdigit() or host == "localhost":
        real_block_ssrf(url)


@pytest.fixture(autouse=True)
def offline_ssrf_guard(monkeypatch):
    monkeypatch.setattr(safe_http_mod, "block_ssrf", _offline_guard)


def test_strip_url_userinfo_drops_credentials():
    assert (
        strip_url_userinfo("http://elastic:ragsuite@example.com/_search?q=*")
        == "http://example.com/_search?q=*"
    )
    assert strip_url_userinfo("https://example.com/page") == "https://example.com/page"


def test_direct_loopback_is_blocked():
    with pytest.raises(HTTPException) as exc:
        prepare_hop_url("http://127.0.0.1/secret")
    assert exc.value.status_code == 400
    assert "restricted" in str(exc.value.detail).lower()


async def test_redirect_to_loopback_is_not_fetched():
    session = FakeSession(
        {
            "https://example.com/start": (302, b"", {"Location": "http://127.0.0.1/secret"}),
            "http://127.0.0.1/secret": b"leaked",
        }
    )
    with pytest.raises(HTTPException) as exc:
        await aiohttp_get_follow(session, "https://example.com/start")
    assert "restricted" in str(exc.value.detail).lower()
    assert session.requested == ["https://example.com/start"]
    assert "http://127.0.0.1/secret" not in session.requested


async def test_userinfo_on_redirect_is_stripped_and_not_requested():
    session = FakeSession(
        {
            "https://example.com/start": (
                302,
                b"",
                {"Location": "http://elastic:ragsuite@example.com/next"},
            ),
            "http://example.com/next": b"ok",
        }
    )
    fetched = await aiohttp_get_follow(session, "https://example.com/start")
    assert fetched.body == b"ok"
    assert session.requested == ["https://example.com/start", "http://example.com/next"]
    assert all("elastic" not in url and "ragsuite" not in url for url in session.requested)


async def test_userinfo_redirect_to_loopback_is_blocked_after_strip():
    session = FakeSession(
        {
            "https://example.com/start": (
                302,
                b"",
                {"Location": "http://elastic:ragsuite@127.0.0.1:9200/_search"},
            ),
            "http://127.0.0.1:9200/_search": b"cluster",
        }
    )
    with pytest.raises(HTTPException):
        await aiohttp_get_follow(session, "https://example.com/start")
    assert session.requested == ["https://example.com/start"]


async def test_hop_cap_stops_before_sixth_url():
    session = FakeSession(
        {
            "https://example.com/a": (302, b"", {"Location": "https://example.com/b"}),
            "https://example.com/b": (302, b"", {"Location": "https://example.com/c"}),
            "https://example.com/c": b"done",
        }
    )
    with pytest.raises(TooManyRedirects):
        await aiohttp_get_follow(session, "https://example.com/a", max_redirects=1)
    assert "https://example.com/c" not in session.requested


async def test_httpx_preview_helper_blocks_redirect_to_loopback():
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if request.url.path == "/start":
            return httpx.Response(302, headers={"Location": "http://127.0.0.1/secret"})
        return httpx.Response(200, content=b"leaked")

    with pytest.raises(HTTPException) as exc:
        await httpx_get_follow(
            "https://example.com/start",
            transport=httpx.MockTransport(handler),
        )
    assert "restricted" in str(exc.value.detail).lower()
    assert requested == ["https://example.com/start"]


def test_playwright_final_url_rejects_loopback():
    ok, reason = _playwright_final_url_allowed("http://127.0.0.1/secret", "https://www.shop.example/")
    assert ok is False
    assert reason == "restricted_address"


def test_playwright_final_url_rejects_external_domain():
    ok, reason = _playwright_final_url_allowed("https://evil.example/", "https://www.shop.example/")
    assert ok is False
    assert reason == "external_domain"


def test_n8n_and_webhooks_disable_redirect_follow():
    from app.services import n8n_service, job_queue
    from app.routes import webhooks
    import inspect

    n8n_src = inspect.getsource(n8n_service.test_n8n_connection)
    webhook_src = inspect.getsource(webhooks)
    job_src = inspect.getsource(job_queue._process_webhook_delivery)
    assert "follow_redirects=False" in n8n_src
    assert "follow_redirects=False" in webhook_src
    assert "follow_redirects=False" in job_src


async def test_guarded_resolver_uses_pinned_ips_not_later_dns():
    from app.platform.safe_http import GuardedResolver
    from app.platform.security_utils import set_hop_pin

    set_hop_pin("example.com", ["203.0.113.10"])
    infos = await GuardedResolver().resolve("example.com", 443)
    assert infos[0]["host"] == "203.0.113.10"
    assert infos[0]["hostname"] == "example.com"


def test_getaddrinfo_pin_skips_rebinding_private_lookup(monkeypatch):
    import socket

    from app.platform.security_utils import set_hop_pin

    recorded: list[str] = []

    def orig(host, port, *args, **kwargs):
        recorded.append(str(host))
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (str(host), port or 0))]

    monkeypatch.setattr(safe_http_mod, "_orig_getaddrinfo", orig)
    safe_http_mod._getaddrinfo_pinned = False
    safe_http_mod._ensure_getaddrinfo_pin()
    set_hop_pin("rebind.test", ["203.0.113.8"])
    result = socket.getaddrinfo("rebind.test", 443)
    assert recorded == ["203.0.113.8"]
    assert result[0][4][0] == "203.0.113.8"
