"""Provider-agnostic embedding rate-limit detection and retry helpers."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone


class EmbeddingRateLimitError(Exception):
    """Embedding API rate limit persisted after inline retries."""


def _error_text(exc: BaseException | str) -> str:
    return str(exc).lower()


def is_embed_rate_limit_error(exc: BaseException | str) -> bool:
    if isinstance(exc, EmbeddingRateLimitError):
        return True
    text = _error_text(exc)
    if any(
        marker in text
        for marker in (
            "429",
            "rate limit",
            "rate_limit",
            "rate-limited",
            "rate_limited",
            "too many requests",
            "too_many_requests",
        )
    ):
        return True
    if "503" in text and any(word in text for word in ("unavailable", "overloaded", "over capacity")):
        return True
    return False


def is_embed_non_retryable_error(exc: BaseException | str) -> bool:
    text = _error_text(exc)
    if "401" in text or "403" in text:
        if any(word in text for word in ("api key", "api_key", "authentication", "unauthorized", "invalid")):
            return True
    if "invalid api key" in text or "incorrect api key" in text:
        return True
    return False


def embed_retry_delay_seconds(
    exc: BaseException | str,
    attempt: int,
    *,
    base_delay: float,
    cap_seconds: float,
) -> float:
    """Seconds to wait before retrying an embedding HTTP call."""
    text = str(exc)
    for pattern in (
        r"retry[- ]after[\"'\s:]+\s*(\d+(?:\.\d+)?)",
        r'"retry_after"\s*:\s*(\d+(?:\.\d+)?)',
        r"retry in (\d+(?:\.\d+)?)\s*seconds?",
    ):
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return min(float(match.group(1)), cap_seconds)

    delay = base_delay * (2 ** max(0, attempt - 1))
    return min(max(base_delay, delay), cap_seconds)


def rate_limit_job_retry_after(
    attempt: int,
    *,
    base_delay_seconds: int,
    cap_seconds: int,
) -> datetime:
    """When to re-run a deferred background ingest job after rate limiting."""
    base = max(30, int(base_delay_seconds))
    delay = min(base * (2 ** min(max(0, attempt - 1), 6)), max(base, cap_seconds))
    return datetime.now(timezone.utc) + timedelta(seconds=delay)
