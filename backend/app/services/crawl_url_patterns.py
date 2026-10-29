"""URL allow/deny pattern matching shared by crawl skip, retrain prune, and query."""
from __future__ import annotations

import re
from urllib.parse import urlparse


def path_and_query(url: str) -> str:
    try:
        parsed = urlparse(url)
        path = parsed.path or "/"
        query = f"?{parsed.query}" if parsed.query else ""
        return f"{path}{query}"
    except Exception:
        return ""


def origin_host(pattern: str) -> str | None:
    """``https://docs.example.com/`` → ``https://docs.example.com``; None if not an origin."""
    cleaned = (pattern or "").strip()
    if not cleaned or "*" in cleaned:
        return None
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    if parsed.query or parsed.fragment:
        return None
    if (parsed.path or "") not in ("", "/"):
        return None
    return f"{parsed.scheme}://{parsed.netloc}".lower()


def matches_url_pattern(url: str, pattern: str) -> bool:
    if not isinstance(pattern, str) or not isinstance(url, str):
        return False
    cleaned = pattern.strip()
    if not cleaned or cleaned.lower() == "string" or not url:
        return False

    host = origin_host(cleaned)
    if host:
        try:
            parsed = urlparse(url)
        except Exception:
            parsed = None
        if (
            parsed is not None
            and parsed.scheme in ("http", "https")
            and parsed.netloc
            and f"{parsed.scheme}://{parsed.netloc}".lower() == host
        ):
            return True

    wildcard_regex = "^" + re.escape(cleaned).replace(r"\*", ".*") + "$"
    try:
        if re.match(wildcard_regex, url, re.IGNORECASE):
            return True
        if re.match(wildcard_regex, path_and_query(url), re.IGNORECASE):
            return True
    except re.error:
        pass

    return cleaned.lower() in url.lower()
