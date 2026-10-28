"""SSRF-safe outbound GET: per-hop guard, no auto-redirects, strip URL userinfo, size cap.

Crawler, sitemap, preview, and connector downloads must follow redirects manually so
every hop passes ``block_ssrf``. URL userinfo is stripped so libraries cannot mint a
fresh Authorization header for a host they have never authenticated to.
"""
from __future__ import annotations

import socket
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional
from urllib.parse import urljoin, urlparse, urlunparse

from fastapi import HTTPException

from .security_utils import block_ssrf, get_hop_pin, set_hop_pin

MAX_REDIRECTS = 5
REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_READ_CHUNK_BYTES = 64 * 1024

ExtraGuard = Callable[[str], None]

_orig_getaddrinfo = socket.getaddrinfo
_getaddrinfo_pinned = False


def _ensure_getaddrinfo_pin() -> None:
    """Route getaddrinfo through hop pins so requests/httpx cannot rebind DNS."""
    global _getaddrinfo_pinned
    if _getaddrinfo_pinned:
        return

    def wrapped(host, port, *args, **kwargs):
        if host is not None:
            pins = get_hop_pin(str(host))
            if pins:
                merged = []
                seen: set[tuple] = set()
                for ip in pins:
                    for row in _orig_getaddrinfo(ip, port, *args, **kwargs):
                        key = (row[0], row[4])
                        if key in seen:
                            continue
                        seen.add(key)
                        merged.append(row)
                if merged:
                    return merged
        return _orig_getaddrinfo(host, port, *args, **kwargs)

    socket.getaddrinfo = wrapped
    _getaddrinfo_pinned = True


class GuardedResolver:
    """aiohttp resolver that prefers IPs pinned by ``prepare_hop_url`` (TLS SNI unchanged)."""

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_UNSPEC):
        pins = get_hop_pin(host)
        if pins:
            infos = []
            for ip in pins:
                fam = socket.AF_INET6 if ":" in ip else socket.AF_INET
                if family not in (0, socket.AF_UNSPEC, fam):
                    continue
                infos.append(
                    {
                        "hostname": host,
                        "host": ip,
                        "port": port,
                        "family": fam,
                        "proto": 0,
                        "flags": 0,
                    }
                )
            if infos:
                return infos
        loop = __import__("asyncio").get_running_loop()
        infos = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM, family=family)
        out = []
        for family_i, proto, _socktype, _canon, sockaddr in infos:
            out.append(
                {
                    "hostname": host,
                    "host": sockaddr[0],
                    "port": sockaddr[1] if len(sockaddr) > 1 else port,
                    "family": family_i,
                    "proto": proto,
                    "flags": 0,
                }
            )
        return out

    async def close(self) -> None:
        return None


def guarded_aiohttp_connector(**kwargs: Any):
    """TCPConnector that pins public IPs from the SSRF hop guard. Caller kwargs win except resolver."""
    import aiohttp

    kwargs = dict(kwargs)
    kwargs["resolver"] = GuardedResolver()
    return aiohttp.TCPConnector(**kwargs)


class SafeHttpError(Exception):
    """Fetch failed after the SSRF guard (bad redirect, size, hop cap)."""


class TooManyRedirects(SafeHttpError):
    def __init__(self) -> None:
        super().__init__("too many redirects")


class ResponseTooLargeError(SafeHttpError):
    def __init__(self) -> None:
        super().__init__("response exceeds size limit")


class RedirectError(SafeHttpError):
    pass


@dataclass(frozen=True)
class SafeFetchResult:
    url: str
    status: int
    headers: Mapping[str, Any]
    body: bytes
    hops: int


def strip_url_userinfo(url: str) -> str:
    """Drop userinfo so clients cannot send Basic auth derived from the URL."""
    parsed = urlparse(str(url))
    if parsed.username is None and parsed.password is None:
        return str(url)
    hostname = parsed.hostname or ""
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    netloc = hostname
    if parsed.port:
        netloc = f"{hostname}:{parsed.port}"
    return urlunparse(
        (parsed.scheme, netloc, parsed.path, parsed.params, parsed.query, parsed.fragment)
    )


def header_value(headers: Mapping[str, Any] | None, name: str) -> Optional[str]:
    if headers is None:
        return None
    getter = getattr(headers, "get", None)
    if callable(getter):
        raw = getter(name)
        if raw is not None and raw != "":
            return str(raw)
    lower = name.lower()
    try:
        items = headers.items()
    except Exception:
        return None
    for key, value in items:
        if str(key).lower() == lower and value is not None and value != "":
            return str(value)
    return None


def prepare_hop_url(url: str, extra_guard: ExtraGuard | None = None) -> str:
    """Strip credentials, require http(s), then run ``block_ssrf`` (and optional extra)."""
    cleaned = strip_url_userinfo(url)
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid or unresolvable URL.")
    pins = block_ssrf(cleaned)
    if extra_guard is not None:
        extra_guard(cleaned)
    if parsed.hostname and isinstance(pins, (list, tuple)) and pins:
        set_hop_pin(parsed.hostname, [str(ip) for ip in pins])
        _ensure_getaddrinfo_pin()
    return cleaned


def redirect_target(current_url: str, location: str | None) -> str:
    if location is None or not str(location).strip():
        raise RedirectError("redirect without Location")
    return urljoin(current_url, str(location).strip())


def decode_text(body: bytes, content_type: str = "") -> str:
    charset = "utf-8"
    lower = (content_type or "").lower()
    if "charset=" in lower:
        charset = lower.split("charset=", 1)[1].split(";")[0].strip().strip('"') or "utf-8"
    try:
        return body.decode(charset)
    except (LookupError, UnicodeDecodeError):
        return body.decode("utf-8", errors="replace")


async def _read_aiohttp_body(resp: Any, max_bytes: int | None) -> bytes:
    buf = bytearray()
    content = getattr(resp, "content", None)
    if content is not None and hasattr(content, "iter_chunked"):
        async for chunk in content.iter_chunked(_READ_CHUNK_BYTES):
            buf.extend(chunk)
            if max_bytes is not None and len(buf) > max_bytes:
                raise ResponseTooLargeError()
        return bytes(buf)
    read = getattr(resp, "read", None)
    if callable(read):
        data = await read()
        if max_bytes is not None and len(data) > max_bytes:
            raise ResponseTooLargeError()
        return data
    return b""


def _read_iter_capped(chunks, max_bytes: int | None) -> bytes:
    buf = bytearray()
    for chunk in chunks:
        if not chunk:
            continue
        buf.extend(chunk)
        if max_bytes is not None and len(buf) > max_bytes:
            raise ResponseTooLargeError()
    return bytes(buf)


async def aiohttp_get_follow(
    session: Any,
    url: str,
    *,
    max_bytes: int | None = None,
    max_redirects: int = MAX_REDIRECTS,
    extra_guard: ExtraGuard | None = None,
    **get_kwargs: Any,
) -> SafeFetchResult:
    """GET ``url`` with ``allow_redirects=False``, guarding every hop."""
    current = url
    hops = 0
    get_kwargs = dict(get_kwargs)
    get_kwargs["allow_redirects"] = False
    while True:
        current = prepare_hop_url(current, extra_guard)
        async with session.get(current, **get_kwargs) as resp:
            status = int(getattr(resp, "status", 0) or 0)
            headers = getattr(resp, "headers", {}) or {}
            if status in REDIRECT_STATUSES:
                if hops >= max_redirects:
                    raise TooManyRedirects()
                current = redirect_target(current, header_value(headers, "Location"))
                hops += 1
                continue
            body = await _read_aiohttp_body(resp, max_bytes)
            return SafeFetchResult(url=current, status=status, headers=headers, body=body, hops=hops)


def requests_get_follow(
    url: str,
    *,
    max_bytes: int | None = None,
    max_redirects: int = MAX_REDIRECTS,
    extra_guard: ExtraGuard | None = None,
    timeout: float | int = 30,
    headers: Mapping[str, str] | None = None,
    **request_kwargs: Any,
) -> SafeFetchResult:
    """Synchronous GET with manual redirects. Never passes ``allow_redirects=True``."""
    import requests

    current = url
    hops = 0
    request_kwargs = dict(request_kwargs)
    request_kwargs.pop("allow_redirects", None)
    request_kwargs.pop("stream", None)
    session = requests.Session()
    try:
        while True:
            current = prepare_hop_url(current, extra_guard)
            with session.get(
                current,
                timeout=timeout,
                headers=headers,
                allow_redirects=False,
                stream=True,
                **request_kwargs,
            ) as resp:
                status = int(resp.status_code)
                resp_headers = resp.headers
                if status in REDIRECT_STATUSES:
                    if hops >= max_redirects:
                        raise TooManyRedirects()
                    current = redirect_target(current, header_value(resp_headers, "Location"))
                    hops += 1
                    continue
                body = _read_iter_capped(resp.iter_content(chunk_size=_READ_CHUNK_BYTES), max_bytes)
                return SafeFetchResult(
                    url=str(resp.url) if resp.url else current,
                    status=status,
                    headers=resp_headers,
                    body=body,
                    hops=hops,
                )
    finally:
        session.close()


async def httpx_get_follow(
    url: str,
    *,
    max_bytes: int | None = None,
    max_redirects: int = MAX_REDIRECTS,
    extra_guard: ExtraGuard | None = None,
    timeout: float | int = 10,
    headers: Mapping[str, str] | None = None,
    **client_kwargs: Any,
) -> SafeFetchResult:
    """Async httpx GET with ``follow_redirects=False`` and a per-hop SSRF guard."""
    import httpx

    client_kwargs = dict(client_kwargs)
    client_kwargs["follow_redirects"] = False
    client_kwargs.setdefault("timeout", timeout)
    current = url
    hops = 0
    async with httpx.AsyncClient(**client_kwargs) as client:
        while True:
            current = prepare_hop_url(current, extra_guard)
            response = await client.get(current, headers=headers, follow_redirects=False)
            status = int(response.status_code)
            if status in REDIRECT_STATUSES:
                if hops >= max_redirects:
                    raise TooManyRedirects()
                current = redirect_target(current, header_value(response.headers, "Location"))
                hops += 1
                continue
            body = response.content
            if max_bytes is not None and len(body) > max_bytes:
                raise ResponseTooLargeError()
            return SafeFetchResult(
                url=str(response.url) if response.url else current,
                status=status,
                headers=response.headers,
                body=body,
                hops=hops,
            )
