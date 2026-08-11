"""Source display score floors — set in backend/.env only (0 = disabled)."""

import os

CHAT_SOURCES_MIN_CONFIDENCE_PCT_ENV = "CHAT_SOURCES_MIN_CONFIDENCE_PCT"
DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT_ENV = "DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT"


def _read_env_pct(env_name: str, default: int = 0) -> int:
    """Read 0–100 from env; missing or invalid values return default."""
    raw = os.environ.get(env_name)
    if raw is None or not str(raw).strip():
        return default
    try:
        return max(0, min(100, int(str(raw).strip())))
    except ValueError:
        return default


def chat_sources_min_confidence_pct() -> int:
    """Chat-only: hide all sources when retrieval confidence is below this (0–100)."""
    return _read_env_pct(CHAT_SOURCES_MIN_CONFIDENCE_PCT_ENV)


def display_sources_min_chunk_similarity_pct() -> int:
    """Hide source chunks whose absolute similarity is below this (0–100). Chat + search.
    Default 20: filters out pure noise (hybrid distance > 0.80) while keeping
    legitimate matches.  The 2-token overlap guard is the primary relevance filter;
    this floor only removes very-weak outliers.
    Override with env DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT=0 to disable.
    """
    return _read_env_pct(DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT_ENV, default=20)
