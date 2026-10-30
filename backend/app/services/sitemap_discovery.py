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
from urllib.parse import urlparse
from xml.etree.ElementTree import ParseError

import aiohttp
from defusedxml import ElementTree as SafeElementTree
from defusedxml.common import DefusedXmlException
from fastapi import HTTPException

from ..platform.safe_http import (
    MAX_REDIRECTS as SAFE_MAX_REDIRECTS,
    aiohttp_get_follow,
    guarded_aiohttp_connector,
    header_value,
    ResponseTooLargeError,
    SafeHttpError,
    TooManyRedirects,
)
from .crawl_throttle import THROTTLE_STATUSES, parse_retry_after
from ..settings import settings

logger = logging.getLogger(__name__)

MAX_SITEMAP_BYTES = 10 * 1024 * 1024
MAX_SITEMAP_FILES = 50
MAX_SITEMAP_NESTING = 3
MAX_REDIRECTS = SAFE_MAX_REDIRECTS
FETCH_TIMEOUT_SECONDS = 30
MAX_SITEMAP_FETCH_ATTEMPTS = 3
MAX_SITEMAP_RETRY_PAUSE_SECONDS = 15.0
_GZIP_MAGIC = b"\x1f\x8b"

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


def sitemap_retry_pause(attempt: int, retry_after: Optional[float]) -> float:
    """Seconds to wait before retrying a 429/503 sitemap file fetch."""
    if retry_after is not None:
        return min(MAX_SITEMAP_RETRY_PAUSE_SECONDS, max(0.0, float(retry_after)))
    return min(MAX_SITEMAP_RETRY_PAUSE_SECONDS, float(2 ** max(1, attempt)))


def is_sitemap_throttle_error(exc: BaseException) -> bool:
    text = _describe(exc)
    return "HTTP 429" in text or "HTTP 503" in text


async def fetch_sitemap_bytes(session: aiohttp.ClientSession, url: str) -> bytes:
    """GET a sitemap, following redirects manually so every hop passes the SSRF guard."""
    last_error: Optional[BaseException] = None
    for attempt in range(1, MAX_SITEMAP_FETCH_ATTEMPTS + 1):
        try:
            fetched = await aiohttp_get_follow(
                session,
                url,
                max_bytes=MAX_SITEMAP_BYTES,
                max_redirects=MAX_REDIRECTS,
            )
        except ResponseTooLargeError as exc:
            raise SitemapFetchError("sitemap exceeds size limit") from exc
        except TooManyRedirects as exc:
            raise SitemapFetchError("too many redirects") from exc
        except SafeHttpError as exc:
            raise SitemapFetchError(str(exc)) from exc
        if fetched.status in THROTTLE_STATUSES:
            last_error = SitemapFetchError(f"HTTP {fetched.status}")
            if attempt < MAX_SITEMAP_FETCH_ATTEMPTS:
                pause = sitemap_retry_pause(
                    attempt,
                    parse_retry_after(header_value(fetched.headers, "Retry-After")),
                )
                logger.info(
                    "Sitemap fetch throttled HTTP %s url=%s attempt=%s pause=%.1fs",
                    fetched.status,
                    url,
                    attempt,
                    pause,
                )
                if pause > 0:
                    await asyncio.sleep(pause)
                continue
            raise last_error
        if fetched.status != 200:
            raise SitemapFetchError(f"HTTP {fetched.status}")
        return decompress_if_gzip(fetched.body)
    raise last_error or SitemapFetchError("HTTP 429")


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
    deferred_once: set[str] = set()
    pending: deque[Tuple[str, int]] = deque([(sitemap_url, 0)])

    owns_session = session is None
    if session is None:
        session = aiohttp.ClientSession(
            headers={"User-Agent": settings.user_agent},
            timeout=aiohttp.ClientTimeout(total=FETCH_TIMEOUT_SECONDS, connect=10),
            connector=guarded_aiohttp_connector(ssl=ssl) if ssl is not None else guarded_aiohttp_connector(),
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
                if is_sitemap_throttle_error(exc) and url not in deferred_once:
                    deferred_once.add(url)
                    seen_sitemaps.discard(url)
                    pending.append((url, level))
                    logger.info("Sitemap fetch deferred after throttle url=%s", url)
                    continue
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
