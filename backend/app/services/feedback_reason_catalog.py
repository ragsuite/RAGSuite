"""
Stable reason tag keys for chat feedback (context_tags) and moderation UI.
Legacy keys from FeedbackDialog remain accepted for backward compatibility.
"""
from __future__ import annotations

from typing import Any, Dict, List, Set

# Canonical keys (match product spec)
POSITIVE_REASON_KEYS: List[str] = [
    "helpful",
    "accurate",
    "complete",
    "clear",
    "fast_response",
]

NEGATIVE_REASON_KEYS: List[str] = [
    "incorrect",
    "hallucinated",
    "missing_sources",
    "too_technical",
    "outdated_information",
    "low_quality",
    "poor_formatting",
    "slow_response",
]

# Older dashboard / dialog tags — still stored if submitted
LEGACY_REASON_KEYS: List[str] = [
    "accuracy",
    "helpfulness",
    "relevance",
    "completeness",
    "clarity",
    "speed",
    "other",
]

ALL_KNOWN_REASON_KEYS: Set[str] = set(POSITIVE_REASON_KEYS + NEGATIVE_REASON_KEYS + LEGACY_REASON_KEYS)


def reason_catalog_public() -> Dict[str, Any]:
    """Payload for GET /feedback/reason-catalog (labels are i18n keys on the client)."""
    return {
        "positive": [{"key": k, "labelKey": f"feedbackModeration.reason.{k}"} for k in POSITIVE_REASON_KEYS],
        "negative": [{"key": k, "labelKey": f"feedbackModeration.reason.{k}"} for k in NEGATIVE_REASON_KEYS],
        "legacy": LEGACY_REASON_KEYS,
    }


def normalize_context_tags(tags: List[str] | None) -> tuple[List[str], List[str]]:
    """
    Returns (allowed_tags, unknown_tags). Unknown tags are dropped from persistence
    but callers may log them.
    """
    if not tags:
        return [], []
    allowed: List[str] = []
    unknown: List[str] = []
    seen: Set[str] = set()
    for raw in tags:
        if raw is None:
            continue
        k = str(raw).strip().lower().replace(" ", "_")
        if not k or k in seen:
            continue
        seen.add(k)
        if k in ALL_KNOWN_REASON_KEYS:
            allowed.append(k)
        else:
            unknown.append(k)
    return allowed, unknown
