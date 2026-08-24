"""Build Content-Security-Policy frame-ancestors for /embed/* pages."""
from __future__ import annotations

import ipaddress
from typing import Any, Iterable
from urllib.parse import urlparse

SELF_ONLY = "frame-ancestors 'self'"


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
    try:
        ipaddress.ip_address(host)
        return None
    except ValueError:
        pass
    if host in ("localhost",):
        return None
    return host


def build_embed_frame_ancestors(domains: Iterable[Any] | None) -> str:
    """Return ``frame-ancestors 'self' https://…`` (https only; apex + www)."""
    origins: list[str] = []
    seen: set[str] = set()

    def add(origin: str) -> None:
        if origin not in seen:
            seen.add(origin)
            origins.append(origin)

    for entry in domains or []:
        host = _host_from_domain_entry(entry)
        if not host:
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

    if not origins:
        return SELF_ONLY
    return "frame-ancestors 'self' " + " ".join(origins)
