"""Helpers for search widget customization fields."""
from __future__ import annotations

from typing import Any

RECENT_SEARCH_LIMIT_MIN = 1
RECENT_SEARCH_LIMIT_MAX = 5
RECENT_SEARCH_LIMIT_DEFAULT = 5


def clamp_recent_search_limit(value: Any) -> int:
    if value is None or isinstance(value, bool) or not isinstance(value, (int, float)):
        return RECENT_SEARCH_LIMIT_DEFAULT
    return max(RECENT_SEARCH_LIMIT_MIN, min(RECENT_SEARCH_LIMIT_MAX, int(value)))
