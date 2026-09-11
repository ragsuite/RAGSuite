"""Helpers for chatbot privacy-policy consent notice (first-time widget users)."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

PRIVACY_NOTICE_CONTENT_MAX = 200
PRIVACY_NOTICE_URL_MAX = 2048
PRIVACY_NOTICE_LINK_PHRASES_MAX = 5

_HTTP_URL_RE = re.compile(r"^https?://", re.IGNORECASE)


def _as_bool(value: Any, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return default


def _as_int(value: Any, default: int = 1) -> int:
    try:
        n = int(value)
        return n if n >= 1 else default
    except (TypeError, ValueError):
        return default


def normalize_link_phrases(raw: Any, content: str) -> List[str]:
    """Keep up to 5 unique phrases that are exact substrings of content."""
    if not content:
        return []
    items: List[Any]
    if raw is None:
        return []
    if isinstance(raw, str):
        items = [p.strip() for p in raw.split(",") if p.strip()]
    elif isinstance(raw, list):
        items = raw
    else:
        return []

    out: List[str] = []
    seen: set[str] = set()
    for item in items:
        phrase = str(item or "").strip()
        if not phrase or phrase in seen:
            continue
        if phrase not in content:
            continue
        seen.add(phrase)
        out.append(phrase[:PRIVACY_NOTICE_CONTENT_MAX])
        if len(out) >= PRIVACY_NOTICE_LINK_PHRASES_MAX:
            break
    return out


def normalize_privacy_url(raw: Any) -> Optional[str]:
    url = str(raw or "").strip()
    if not url:
        return None
    url = url[:PRIVACY_NOTICE_URL_MAX]
    if not _HTTP_URL_RE.match(url):
        return None
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if not parsed.netloc:
        return None
    return url


def normalize_privacy_notice_payload(
    raw: Any,
    *,
    enabled: Optional[bool] = None,
    previous: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Normalize notice JSON.
    Bumps version when content/url/phrases/underline change vs previous.
    """
    prev = previous if isinstance(previous, dict) else {}
    data = raw if isinstance(raw, dict) else {}

    content = str(data.get("content") or data.get("body") or "").strip()[:PRIVACY_NOTICE_CONTENT_MAX]
    url = normalize_privacy_url(data.get("url") or data.get("privacyPolicyUrl"))
    phrases_raw = data.get("linkPhrases")
    if phrases_raw is None:
        phrases_raw = data.get("link_phrases")
    link_phrases = normalize_link_phrases(phrases_raw, content)
    underline = _as_bool(
        data.get("underlineLinks") if data.get("underlineLinks") is not None else data.get("underline_links"),
        False,
    )

    resolved_enabled = bool(enabled) if enabled is not None else _as_bool(
        data.get("enabled"),
        _as_bool(prev.get("enabled"), False),
    )

    prev_content = str(prev.get("content") or "").strip()
    prev_url = str(prev.get("url") or "").strip()
    prev_phrases = list(prev.get("linkPhrases") or prev.get("link_phrases") or [])
    prev_underline = _as_bool(
        prev.get("underlineLinks") if prev.get("underlineLinks") is not None else prev.get("underline_links"),
        False,
    )
    material_changed = (
        content != prev_content
        or (url or "") != prev_url
        or link_phrases != prev_phrases
        or underline != prev_underline
    )
    had_prior_material = bool(prev_content or prev_url)
    version = _as_int(prev.get("version"), 1)
    if material_changed and had_prior_material:
        version = version + 1

    return {
        "enabled": resolved_enabled,
        "content": content,
        "url": url,
        "linkPhrases": link_phrases,
        "underlineLinks": underline,
        "version": version,
    }


def validate_privacy_notice_for_enable(notice: Dict[str, Any]) -> Optional[str]:
    """Return error detail if enabled notice is incomplete; else None."""
    if not notice.get("enabled"):
        return None
    content = str(notice.get("content") or "").strip()
    if not content:
        return "Privacy notice content is required when the notice is enabled."
    if len(content) > PRIVACY_NOTICE_CONTENT_MAX:
        return f"Privacy notice content must be at most {PRIVACY_NOTICE_CONTENT_MAX} characters."
    url = notice.get("url")
    if not url:
        return "Privacy policy URL is required when the notice is enabled."
    phrases = notice.get("linkPhrases") or []
    if not isinstance(phrases, list):
        return "linkPhrases must be a list."
    for phrase in phrases:
        if str(phrase) not in content:
            return f'Link phrase "{phrase}" must appear in the notice content.'
    return None


def privacy_notice_from_row(settings: Any) -> Dict[str, Any]:
    """Build privacy notice dict from ChatbotSettings row or None."""
    if settings is None:
        return {
            "enabled": False,
            "content": "",
            "url": None,
            "linkPhrases": [],
            "underlineLinks": False,
            "version": 1,
        }
    enabled = bool(getattr(settings, "privacy_notice_enabled", False))
    raw = getattr(settings, "privacy_notice", None)
    normalized = normalize_privacy_notice_payload(raw, enabled=enabled, previous=raw if isinstance(raw, dict) else None)
    # When reading, do not bump version — restore stored version if present
    if isinstance(raw, dict) and raw.get("version") is not None:
        normalized["version"] = _as_int(raw.get("version"), 1)
    normalized["enabled"] = enabled
    return normalized
