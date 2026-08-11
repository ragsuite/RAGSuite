"""Helpers for validating frontend origins from browser requests."""

from __future__ import annotations

from urllib.parse import urlparse

from fastapi import Request

from app.settings import settings


def _normalized_origin(raw: str | None) -> str | None:
    # Coerce mocks / non-strings from tests and odd ASGI headers.
    if raw is None:
        return None
    if not isinstance(raw, str):
        try:
            raw = str(raw)
        except Exception:
            return None
    candidate = raw.strip()
    if not candidate or candidate.startswith("<MagicMock"):
        return None
    try:
        parsed = urlparse(candidate)
    except (TypeError, ValueError):
        return None
    if not parsed.scheme or not parsed.netloc:
        return None
    # Keep scheme+netloc only; discard path/query/fragment.
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _header_str(request: Request, name: str) -> str:
    """Return a header as a plain string (never a mock / non-str)."""
    try:
        value = request.headers.get(name, "")
    except Exception:
        return ""
    if value is None:
        return ""
    if not isinstance(value, str):
        return ""
    return value


def _trusted_frontend_origins() -> set[str]:
    allowed: set[str] = set()

    frontend_base = _normalized_origin(settings.frontend_base_url)
    if frontend_base:
        allowed.add(frontend_base)

    for origin in settings.cors_origins_list:
        normalized = _normalized_origin(origin)
        if normalized:
            allowed.add(normalized)
    return allowed


def frontend_base_from_request_if_trusted(request: Request) -> str | None:
    """
    Return request origin/referer origin only when it is explicitly trusted.

    This prevents attacker-controlled Origin/Referer headers from influencing
    auth-sensitive redirect URLs (SSO callback and invite links).
    """
    trusted = _trusted_frontend_origins()
    if not trusted:
        return None

    origin = _normalized_origin(_header_str(request, "origin"))
    if origin and origin in trusted:
        return origin

    referer = _normalized_origin(_header_str(request, "referer"))
    if referer and referer in trusted:
        return referer

    return None
