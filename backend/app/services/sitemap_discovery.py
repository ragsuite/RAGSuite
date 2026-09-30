"""Sitemap XML discovery — page URLs listed in a sitemap (including nested sitemap indexes).

Used by Sitemap XML crawl sources: the crawler fetches exactly these pages (no link following).
Every fetch passes the SSRF guard (including each redirect hop), responses are size-capped
(also after gzip decompression) and XML is parsed with ``defusedxml`` (XXE / entity bombs).
"""
from __future__ import annotations

import asyncio
import gzip
import io
import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse
from xml.etree.ElementTree import ParseError

import aiohttp
from defusedxml import ElementTree as SafeElementTree
from defusedxml.common import DefusedXmlException
from fastapi import HTTPException

from ..platform.security_utils import block_ssrf
from ..settings import settings

logger = logging.getLogger(__name__)

MAX_SITEMAP_BYTES = 10 * 1024 * 1024
MAX_SITEMAP_FILES = 50
MAX_SITEMAP_NESTING = 3
MAX_REDIRECTS = 5
FETCH_TIMEOUT_SECONDS = 30
_READ_CHUNK_BYTES = 64 * 1024
_GZIP_MAGIC = b"\x1f\x8b"
_REDIRECT_STATUSES = {301, 302, 303, 307, 308}

UrlFilter = Callable[[str], Tuple[bool, str]]


class SitemapFetchError(Exception):
    """A sitemap file could not be fetched or decoded."""


@dataclass
class SitemapDiscovery:
    urls: List[str] = field(default_factory=list)
    skipped: Dict[str, int] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    sitemaps_read: int = 0
    truncated: bool = False

    def skip(self, reason: str) -> None:
        self.skipped[reason] = self.skipped.get(reason, 0) + 1

    def summary(self) -> Dict[str, Any]:
        return {
            "urls_found": len(self.urls),
            "sitemaps_read": self.sitemaps_read,
            "skipped": dict(self.skipped),
            "errors": self.errors[:20],
            "truncated": self.truncated,
        }


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _site_host(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def parse_sitemap(content: bytes) -> Tuple[str, List[str]]:
    """Return ``("urlset" | "sitemapindex", [loc, ...])``. Raises ``ValueError`` for non-sitemaps."""
    try:
        root = SafeElementTree.fromstring(content)
    except (ParseError, DefusedXmlException) as exc:
        raise ValueError(f"invalid sitemap XML ({exc.__class__.__name__})") from exc

    kind = _local_name(root.tag)
    if kind not in ("urlset", "sitemapindex"):
        raise ValueError(f"not a sitemap (root element <{kind}>)")

    locs: List[str] = []
    for entry in root:
        for child in entry:
            if _local_name(child.tag) == "loc" and child.text and child.text.strip():
                locs.append(child.text.strip())
    return kind, locs


def decompress_if_gzip(data: bytes) -> bytes:
    if not data.startswith(_GZIP_MAGIC):
        return data
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as archive:
            out = archive.read(MAX_SITEMAP_BYTES + 1)
    except (OSError, EOFError) as exc:
        raise SitemapFetchError("corrupt gzip sitemap") from exc
    if len(out) > MAX_SITEMAP_BYTES:
        raise SitemapFetchError("sitemap exceeds size limit")
    return out


async def _guard(url: str) -> None:
    await asyncio.to_thread(block_ssrf, url)


async def fetch_sitemap_bytes(session: aiohttp.ClientSession, url: str) -> bytes:
    """GET a sitemap, following redirects manually so every hop passes the SSRF guard."""
    current = url
    for _ in range(MAX_REDIRECTS + 1):
        await _guard(current)
        async with session.get(current, allow_redirects=False) as resp:
            if resp.status in _REDIRECT_STATUSES:
                location = resp.headers.get("Location")
                if not location:
                    raise SitemapFetchError(f"HTTP {resp.status} without Location")
                current = urljoin(current, location)
                continue
            if resp.status != 200:
                raise SitemapFetchError(f"HTTP {resp.status}")
            buf = bytearray()
            async for chunk in resp.content.iter_chunked(_READ_CHUNK_BYTES):
                buf.extend(chunk)
                if len(buf) > MAX_SITEMAP_BYTES:
                    raise SitemapFetchError("sitemap exceeds size limit")
        return decompress_if_gzip(bytes(buf))
    raise SitemapFetchError("too many redirects")


def _describe(exc: BaseException) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)
    if isinstance(exc, asyncio.TimeoutError):
        return "timed out"
    return str(exc) or exc.__class__.__name__


def _default_filter(url: str) -> Tuple[bool, str]:
    if url.startswith(("http://", "https://")):
        return True, "allowed"
    return False, "invalid_scheme"


async def discover_sitemap_urls(
    sitemap_url: str,
    *,
    max_urls: int,
    url_filter: Optional[UrlFilter] = None,
    ssl: Any = None,
    session: Optional[aiohttp.ClientSession] = None,
) -> SitemapDiscovery:
    """Collect page URLs from ``sitemap_url`` (breadth-first through sitemap indexes).

    ``url_filter(url) -> (allowed, reason)`` decides which page URLs are kept (same-site,
    allow/deny patterns). Nested sitemaps must live on the same site as ``sitemap_url``.
    """
    result = SitemapDiscovery()
    accept = url_filter or _default_filter
    root_host = _site_host(sitemap_url)
    seen_pages: set[str] = set()
    seen_sitemaps: set[str] = set()
    pending: deque[Tuple[str, int]] = deque([(sitemap_url, 0)])

    owns_session = session is None
    if session is None:
        session = aiohttp.ClientSession(
            headers={"User-Agent": settings.user_agent},
            timeout=aiohttp.ClientTimeout(total=FETCH_TIMEOUT_SECONDS, connect=10),
            connector=aiohttp.TCPConnector(ssl=ssl) if ssl is not None else None,
        )
    try:
        while pending and not result.truncated:
            url, level = pending.popleft()
            if url in seen_sitemaps:
                continue
            if result.sitemaps_read >= MAX_SITEMAP_FILES:
                result.truncated = True
                result.errors.append(f"stopped after {MAX_SITEMAP_FILES} sitemap files")
                break
            seen_sitemaps.add(url)

            try:
                kind, locs = parse_sitemap(await fetch_sitemap_bytes(session, url))
            except (SitemapFetchError, ValueError, aiohttp.ClientError, asyncio.TimeoutError, HTTPException) as exc:
                result.errors.append(f"{url}: {_describe(exc)}")
                continue
            result.sitemaps_read += 1

            if kind == "sitemapindex":
                if level >= MAX_SITEMAP_NESTING:
                    result.errors.append(f"{url}: sitemap index nested deeper than {MAX_SITEMAP_NESTING}")
                    continue
                for loc in locs:
                    if _site_host(loc) != root_host:
                        result.skip("external_sitemap")
                        continue
                    pending.append((loc, level + 1))
                continue

            for loc in locs:
                if loc in seen_pages:
                    continue
                seen_pages.add(loc)
                allowed, reason = accept(loc)
                if not allowed:
                    result.skip(reason)
                    continue
                result.urls.append(loc)
                if len(result.urls) >= max_urls:
                    result.truncated = True
                    break
    finally:
        if owns_session:
            await session.close()

    logger.info(
        "Sitemap discovery %s: %d URLs from %d sitemap(s), skipped=%s, errors=%d",
        sitemap_url,
        len(result.urls),
        result.sitemaps_read,
        result.skipped,
        len(result.errors),
    )
    return result
