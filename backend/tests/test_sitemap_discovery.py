"""Sitemap XML discovery: urlset/index parsing, gzip, caps, host filtering, SSRF-guarded redirects."""
from __future__ import annotations

import gzip
from typing import Dict, Tuple, Union
from urllib.parse import urlparse

import pytest
from fastapi import HTTPException

from app.platform.security_utils import block_ssrf as real_block_ssrf
from app.services import sitemap_discovery as sd

NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'


def urlset(*locs: str) -> bytes:
    body = "".join(f"<url><loc>{loc}</loc></url>" for loc in locs)
    return f'<?xml version="1.0" encoding="UTF-8"?><urlset {NS}>{body}</urlset>'.encode()


def sitemapindex(*locs: str) -> bytes:
    body = "".join(f"<sitemap><loc>{loc}</loc></sitemap>" for loc in locs)
    return f'<?xml version="1.0" encoding="UTF-8"?><sitemapindex {NS}>{body}</sitemapindex>'.encode()


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


Route = Union[bytes, Tuple[int, bytes, Dict[str, str]]]


class FakeSession:
    """Minimal aiohttp.ClientSession stand-in keyed by exact URL."""

    def __init__(self, routes: Dict[str, Route]):
        self.routes = routes
        self.requested: list[str] = []

    def get(self, url: str, allow_redirects: bool = True):
        assert allow_redirects is False, "redirects must be followed manually (SSRF guard per hop)"
        self.requested.append(url)
        route = self.routes.get(url)
        if route is None:
            return _Response(404)
        if isinstance(route, bytes):
            return _Response(200, route)
        status, body, headers = route
        return _Response(status, body, headers)


@pytest.fixture(autouse=True)
def offline_ssrf_guard(monkeypatch):
    """Real guard for IP literals (no DNS needed); public test hostnames pass."""

    def guard(url: str) -> None:
        host = urlparse(url).hostname or ""
        if host.replace(".", "").isdigit() or host == "localhost":
            real_block_ssrf(url)

    monkeypatch.setattr(sd, "block_ssrf", guard)


async def discover(root: str, routes: Dict[str, Route], **kwargs):
    session = FakeSession(routes)
    result = await sd.discover_sitemap_urls(root, max_urls=kwargs.pop("max_urls", 100), session=session, **kwargs)
    return result, session


async def test_urlset_returns_page_urls_deduplicated():
    root = "https://example.com/sitemap.xml"
    result, _ = await discover(
        root,
        {root: urlset("https://example.com/a", "https://example.com/b", "https://example.com/a")},
    )
    assert result.urls == ["https://example.com/a", "https://example.com/b"]
    assert result.sitemaps_read == 1
    assert result.errors == []
    assert not result.truncated


async def test_sitemap_index_is_followed_and_external_sitemaps_skipped():
    root = "https://www.example.com/sitemap_index.xml"
    result, session = await discover(
        root,
        {
            root: sitemapindex(
                "https://example.com/posts.xml",
                "https://www.example.com/pages.xml",
                "https://evil.test/sitemap.xml",
            ),
            "https://example.com/posts.xml": urlset("https://example.com/post-1"),
            "https://www.example.com/pages.xml": urlset("https://www.example.com/about"),
        },
    )
    assert result.urls == ["https://example.com/post-1", "https://www.example.com/about"]
    assert result.sitemaps_read == 3
    assert result.skipped == {"external_sitemap": 1}
    assert "https://evil.test/sitemap.xml" not in session.requested


async def test_gzip_sitemap_is_decompressed():
    root = "https://example.com/sitemap.xml.gz"
    result, _ = await discover(root, {root: gzip.compress(urlset("https://example.com/gz-page"))})
    assert result.urls == ["https://example.com/gz-page"]


async def test_url_filter_decides_which_pages_are_kept():
    root = "https://example.com/sitemap.xml"

    def only_docs(url: str):
        return ("/docs/" in url, "allowed" if "/docs/" in url else "denylist")

    result, _ = await discover(
        root,
        {root: urlset("https://example.com/docs/1", "https://example.com/blog/1", "https://example.com/docs/2")},
        url_filter=only_docs,
    )
    assert result.urls == ["https://example.com/docs/1", "https://example.com/docs/2"]
    assert result.skipped == {"denylist": 1}


async def test_default_filter_rejects_non_http_locs():
    root = "https://example.com/sitemap.xml"
    result, _ = await discover(root, {root: urlset("ftp://example.com/file", "https://example.com/ok")})
    assert result.urls == ["https://example.com/ok"]
    assert result.skipped == {"invalid_scheme": 1}


async def test_max_urls_truncates():
    root = "https://example.com/sitemap.xml"
    pages = [f"https://example.com/p{i}" for i in range(10)]
    result, _ = await discover(root, {root: urlset(*pages)}, max_urls=3)
    assert result.urls == pages[:3]
    assert result.truncated


async def test_sitemap_file_cap(monkeypatch):
    monkeypatch.setattr(sd, "MAX_SITEMAP_FILES", 2)
    root = "https://example.com/index.xml"
    children = [f"https://example.com/s{i}.xml" for i in range(4)]
    routes: Dict[str, Route] = {root: sitemapindex(*children)}
    for i, child in enumerate(children):
        routes[child] = urlset(f"https://example.com/page-{i}")
    result, _ = await discover(root, routes)
    assert result.sitemaps_read == 2
    assert result.truncated
    assert any("stopped after 2 sitemap files" in e for e in result.errors)


async def test_nesting_limit(monkeypatch):
    monkeypatch.setattr(sd, "MAX_SITEMAP_NESTING", 1)
    root = "https://example.com/l0.xml"
    result, _ = await discover(
        root,
        {
            root: sitemapindex("https://example.com/l1.xml"),
            "https://example.com/l1.xml": sitemapindex("https://example.com/l2.xml"),
            "https://example.com/l2.xml": urlset("https://example.com/deep"),
        },
    )
    assert result.urls == []
    assert any("nested deeper" in e for e in result.errors)


async def test_oversized_response_is_rejected(monkeypatch):
    monkeypatch.setattr(sd, "MAX_SITEMAP_BYTES", 64)
    root = "https://example.com/sitemap.xml"
    result, _ = await discover(root, {root: urlset(*[f"https://example.com/{i}" for i in range(20)])})
    assert result.urls == []
    assert any("size limit" in e for e in result.errors)


async def test_gzip_bomb_is_capped_after_decompression(monkeypatch):
    monkeypatch.setattr(sd, "MAX_SITEMAP_BYTES", 1024)
    root = "https://example.com/sitemap.xml.gz"
    bomb = gzip.compress(b"<" + b"a" * 100_000)
    assert len(bomb) < 1024
    result, _ = await discover(root, {root: bomb})
    assert result.urls == []
    assert any("size limit" in e for e in result.errors)


@pytest.mark.parametrize(
    "payload, expected",
    [
        (b"<html><body>not a sitemap</body></html>", "not a sitemap"),
        (b"<urlset><url><loc>broken", "invalid sitemap XML"),
        (
            b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]>'
            b"<urlset><url><loc>&x;</loc></url></urlset>",
            "invalid sitemap XML",
        ),
        (
            b'<?xml version="1.0"?><!DOCTYPE r [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]>'
            b"<urlset><url><loc>&b;</loc></url></urlset>",
            "invalid sitemap XML",
        ),
    ],
)
async def test_malformed_and_hostile_xml_is_rejected(payload: bytes, expected: str):
    root = "https://example.com/sitemap.xml"
    result, _ = await discover(root, {root: payload})
    assert result.urls == []
    assert len(result.errors) == 1 and expected in result.errors[0]


async def test_http_error_is_recorded_not_raised():
    root = "https://example.com/sitemap.xml"
    result, _ = await discover(root, {})
    assert result.urls == []
    assert result.errors == [f"{root}: HTTP 404"]


async def test_redirect_is_followed_on_same_site():
    root = "https://example.com/sitemap.xml"
    result, session = await discover(
        root,
        {
            root: (301, b"", {"Location": "/new-sitemap.xml"}),
            "https://example.com/new-sitemap.xml": urlset("https://example.com/moved"),
        },
    )
    assert result.urls == ["https://example.com/moved"]
    assert session.requested == [root, "https://example.com/new-sitemap.xml"]


async def test_redirect_to_private_address_is_blocked_by_ssrf_guard():
    root = "https://example.com/sitemap.xml"
    result, session = await discover(
        root,
        {
            root: (302, b"", {"Location": "http://127.0.0.1/admin.xml"}),
            "http://127.0.0.1/admin.xml": urlset("https://example.com/leak"),
        },
    )
    assert result.urls == []
    assert "http://127.0.0.1/admin.xml" not in session.requested
    assert any("restricted address" in e for e in result.errors)


async def test_too_many_redirects(monkeypatch):
    monkeypatch.setattr(sd, "MAX_REDIRECTS", 1)
    root = "https://example.com/a.xml"
    result, _ = await discover(
        root,
        {
            root: (302, b"", {"Location": "https://example.com/b.xml"}),
            "https://example.com/b.xml": (302, b"", {"Location": "https://example.com/c.xml"}),
        },
    )
    assert any("too many redirects" in e for e in result.errors)


def test_block_ssrf_rejects_loopback_directly():
    with pytest.raises(HTTPException):
        real_block_ssrf("http://127.0.0.1/sitemap.xml")


def test_summary_shape():
    result = sd.SitemapDiscovery(urls=["https://example.com/a"], sitemaps_read=1)
    result.skip("external_sitemap")
    assert result.summary() == {
        "urls_found": 1,
        "sitemaps_read": 1,
        "skipped": {"external_sitemap": 1},
        "errors": [],
        "truncated": False,
    }
