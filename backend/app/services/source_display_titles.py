"""Shared source title cleanup for chat and search citations."""
from __future__ import annotations

import re

_UUID_UNDERSCORE_PREFIX_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_",
    re.IGNORECASE,
)
_UUID_SPACED_PREFIX_RE = re.compile(
    r"^[0-9a-f]{8}\s+[0-9a-f]{4}\s+[0-9a-f]{4}\s+[0-9a-f]{4}\s+[0-9a-f]{12}\s+",
    re.IGNORECASE,
)
_EXT_RE = re.compile(r"\.(pdf|html?|txt|docx?|xlsx?|pptx?|md|csv)$", re.I)


def clean_doc_title(title: str, *, strip_extension: bool = True) -> str:
    """Remove ingest UUID / reindex prefixes and normalize upload filenames for display."""
    if not title:
        return title
    cleaned = title.strip()
    cleaned = _UUID_UNDERSCORE_PREFIX_RE.sub("", cleaned)
    cleaned = cleaned.replace("_", " ").strip()
    cleaned = _UUID_SPACED_PREFIX_RE.sub("", cleaned)
    if cleaned.lower().startswith("reindex "):
        cleaned = cleaned[8:].strip()
    if strip_extension:
        cleaned = _EXT_RE.sub("", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned or title
