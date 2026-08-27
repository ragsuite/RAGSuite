"""Build Content-Security-Policy frame-ancestors for /embed/* pages."""
from __future__ import annotations

import ipaddress
from typing import Any, Iterable
from urllib.parse import urlparse

SELF_ONLY = "frame-ancestors 'self'"

LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1"})
LOOPBACK_CSP_SOURCES = (
    "http://localhost:*",
    "https://localhost:*",
    "http://127.0.0.1:*",
    "https://127.0.0.1:*",
)


def _host_from_domain_entry(entry: Any) -> str | None:
    if isinstance(entry, dict):
        raw = None
        for key in ("normalizedUrl", "url", "hostname", "host"):
            value = entry.get(key)
            if isinstance(value, str) and value.strip():
                raw = value.strip()
                break
        entry = raw
    if not isinstance(entry, str):
        return None
    value = entry.strip()
    if not value or value == "*":
        return None
    if "://" not in value:
        value = f"https://{value.lstrip('/')}"
    parsed = urlparse(value)
    if parsed.scheme and parsed.scheme not in ("http", "https"):
        return None
    host = (parsed.hostname or "").strip().lower().rstrip(".")
    if not host:
        return None
    if host in LOOPBACK_HOSTS:
        return host
    try:
        ipaddress.ip_address(host)
        # Non-loopback IP literals (LAN, link-local, etc.) stay out of CSP.
        return None
    except ValueError:
        pass
    return host


def build_embed_frame_ancestors(domains: Iterable[Any] | None) -> str:
    """Return ``frame-ancestors 'self' …`` from one project's Allowed Domains.

    Public hostnames are https-only (apex + www). Loopback hosts listed in the
    project domains become ``http(s)://localhost:*`` / ``127.0.0.1:*``.
    """
    origins: list[str] = []
    seen: set[str] = set()
    include_loopback = False

    def add(origin: str) -> None:
        if origin not in seen:
            seen.add(origin)
            origins.append(origin)

    for entry in domains or []:
        host = _host_from_domain_entry(entry)
        if not host:
            continue
        if host in LOOPBACK_HOSTS:
            include_loopback = True
            continue
        if host.startswith("*."):
            add(f"https://{host}")
            continue
        add(f"https://{host}")
        if host.startswith("www."):
            apex = host[4:]
            if apex:
                add(f"https://{apex}")
        else:
            add(f"https://www.{host}")

    if include_loopback:
        for source in LOOPBACK_CSP_SOURCES:
            add(source)

    if not origins:
        return SELF_ONLY
    return "frame-ancestors 'self' " + " ".join(origins)
