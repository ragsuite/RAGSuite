"""Build Content-Security-Policy frame-ancestors for /embed/* pages."""
from __future__ import annotations

import ipaddress
from typing import Any, Iterable
from urllib.parse import parse_qs, urlparse

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


def _normalize_host_for_compare(host: str) -> str:
    value = (host or "").strip().lower().rstrip(".")
    if value.startswith("www."):
        return value[4:]
    return value


def parse_parent_origin(raw: str | None) -> str | None:
    """Return a canonical http(s) origin, or None if unusable / unsafe."""
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        parsed = urlparse(value)
    except Exception:
        return None
    if parsed.scheme not in ("http", "https"):
        return None
    if not parsed.hostname:
        return None
    # Reject credentials / unexpected components in the origin string.
    if parsed.username or parsed.password:
        return None
    host = parsed.hostname.strip().lower().rstrip(".")
    if not host:
        return None
    try:
        # Reconstruct origin only (scheme + host + optional port).
        netloc = parsed.netloc.lower()
        if "@" in netloc:
            return None
        return f"{parsed.scheme}://{netloc}"
    except Exception:
        return None


def parent_origin_from_embed_path(path_or_uri: str | None) -> str | None:
    """Extract parentOrigin / parent_origin from an embed request URI or path+query."""
    if not isinstance(path_or_uri, str) or not path_or_uri.strip():
        return None
    raw = path_or_uri.strip()
    try:
        # urlparse needs a scheme for netloc; paths like /embed/...?q= work as-is.
        parsed = urlparse(raw if "://" in raw else f"https://embed.local{raw}")
        qs = parse_qs(parsed.query, keep_blank_values=False)
    except Exception:
        return None
    for key in ("parentOrigin", "parent_origin"):
        values = qs.get(key) or []
        if values:
            origin = parse_parent_origin(values[0])
            if origin:
                return origin
    return None


def project_id_from_embed_path(path_or_uri: str | None) -> str | None:
    """Extract projectId / project_id from an embed request URI or path+query.

    Returns the raw string only; callers must UUID-parse / validate.
    """
    if not isinstance(path_or_uri, str) or not path_or_uri.strip():
        return None
    raw = path_or_uri.strip()
    try:
        parsed = urlparse(raw if "://" in raw else f"https://embed.local{raw}")
        qs = parse_qs(parsed.query, keep_blank_values=False)
    except Exception:
        return None
    for key in ("projectId", "project_id"):
        values = qs.get(key) or []
        if values:
            value = str(values[0] or "").strip()
            if value:
                return value
    return None


def parent_allowed_for_domains(parent_origin: str, domains: Iterable[Any] | None) -> bool:
    """True when the parent host matches the project's Allowed Domains entries."""
    origin = parse_parent_origin(parent_origin)
    if not origin:
        return False
    parsed = urlparse(origin)
    parent_host = (parsed.hostname or "").strip().lower().rstrip(".")
    if not parent_host:
        return False
    parent_cmp = _normalize_host_for_compare(parent_host)
    parent_is_loopback = parent_host in LOOPBACK_HOSTS

    for entry in domains or []:
        allowed_host = _host_from_domain_entry(entry)
        if not allowed_host:
            continue
        if allowed_host in LOOPBACK_HOSTS:
            if parent_is_loopback:
                return True
            continue
        if allowed_host.startswith("*."):
            suffix = allowed_host[1:]  # ".partner.example.de"
            if parent_host.endswith(suffix) or parent_cmp.endswith(suffix.lstrip(".")):
                # Require at least one label before the wildcard suffix.
                if parent_host != allowed_host[2:] and parent_host.endswith(suffix):
                    return True
            continue
        if _normalize_host_for_compare(allowed_host) == parent_cmp:
            return True
    return False


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


def build_embed_frame_ancestors_for_parent(
    domains: Iterable[Any] | None,
    parent_origin: str | None,
) -> str:
    """Narrow CSP to the current parent when it is on the allowlist.

    - Parent allowed → ``frame-ancestors 'self' <exact-parent-origin>``
      (loopback parents use the standard localhost/127.0.0.1:* sources).
    - Parent present but not allowed → ``SELF_ONLY``.
    """
    origin = parse_parent_origin(parent_origin)
    if not origin:
        return SELF_ONLY
    if not parent_allowed_for_domains(origin, domains):
        return SELF_ONLY

    parsed = urlparse(origin)
    host = (parsed.hostname or "").strip().lower()
    if host in LOOPBACK_HOSTS:
        return "frame-ancestors 'self' " + " ".join(LOOPBACK_CSP_SOURCES)

    return f"frame-ancestors 'self' {origin}"
