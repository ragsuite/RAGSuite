"""Read Redis / Chroma / Ollama connection settings with backward-compatible defaults."""

from __future__ import annotations

from typing import Optional
from urllib.parse import urlparse

from app.settings import settings


def redis_host() -> str:
    return (settings.redis_host or "").strip()


def redis_port() -> int:
    return int(settings.redis_port or 6382)


def redis_url_or_none(*, db: int = 1) -> Optional[str]:
    """Resolve redis URL: settings.redis_url > REDIS_HOST/PORT > None."""
    if settings.redis_url:
        return str(settings.redis_url).strip() or None
    host = redis_host()
    if not host:
        return None
    return f"redis://{host}:{redis_port()}/{db}"


def chroma_mode() -> str:
    return (settings.chroma_mode or "local").strip().lower()


def chroma_http_enabled() -> bool:
    return chroma_mode() == "http"


def chroma_host() -> str:
    return (settings.chroma_host or "127.0.0.1").strip()


def chroma_port() -> int:
    return int(settings.chroma_port or 8004)


def chroma_ssl() -> bool:
    return bool(settings.chroma_ssl)


def chroma_persist_path(default: str = "") -> str:
    persist = (settings.chroma_persist_path or "").strip()
    return persist or default


def ollama_base_url() -> str:
    return (settings.ollama_base_url or "http://localhost:11434").strip()


def origin_from_url(raw: str) -> Optional[str]:
    """Return scheme://netloc for an absolute URL, or None."""
    candidate = (raw or "").strip()
    if not candidate:
        return None
    parsed = urlparse(candidate)
    if parsed.scheme and parsed.netloc:
        return f"{parsed.scheme}://{parsed.netloc}"
    return None
