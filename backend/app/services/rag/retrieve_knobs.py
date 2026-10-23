"""Retrieve control-plane knobs: threshold presets and candidate pool size.

Null stored columns keep today's live chat/search path. New values only change
behaviour when an admin opts in.
"""
from __future__ import annotations

from typing import Optional, Tuple

PRESETS = ("strict", "balanced", "broad", "custom")
DEFAULT_PRESET = "balanced"
DEFAULT_RERANK_CANDIDATES = 64
MIN_RERANK_CANDIDATES = 16
MAX_RERANK_CANDIDATES = 256

# Chat Balanced is today's *applied* threshold (query clamp 0.45), not the unused 0.5 column default.
CHAT_PRESET_THRESHOLDS = {"strict": 0.55, "balanced": 0.45, "broad": 0.25}
SEARCH_PRESET_THRESHOLDS = {"strict": 0.50, "balanced": 0.45, "broad": 0.25}

CHAT_LEGACY_THRESHOLD_FLOOR = 0.2
CHAT_LEGACY_THRESHOLD_CAP = 0.45
CHAT_NULL_THRESHOLD = 0.3

# Small-collection hybrid (Retriever._hybrid_fuse) when keyword_blend is NULL.
SMALL_SEMANTIC_WEIGHT = 0.65
SMALL_KEYWORD_WEIGHT = 0.35


def normalize_preset(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    raw = str(value).strip().lower()
    return raw if raw in PRESETS else None


def preset_threshold(surface: str, preset: Optional[str]) -> Optional[float]:
    table = CHAT_PRESET_THRESHOLDS if surface == "chat" else SEARCH_PRESET_THRESHOLDS
    key = normalize_preset(preset)
    if key is None or key == "custom":
        return None
    return table[key]


def clamp_candidates(value: Optional[int], top_k: int) -> Optional[int]:
    if value is None:
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return max(MIN_RERANK_CANDIDATES, max(int(top_k or 1), min(n, MAX_RERANK_CANDIDATES)))


def pool_size(top_k: int, rerank_candidates: Optional[int]) -> int:
    """ES fusion pool. None candidates → today's max(k*3, k) over-fetch."""
    k = max(1, int(top_k or 1))
    if rerank_candidates is None:
        return max(k * 3, k)
    return max(k, clamp_candidates(rerank_candidates, k) or k)


def apply_chat_query_threshold(stored: Optional[float], preset: Optional[str]) -> float:
    """Live chat threshold. Legacy / null / balanced keep the 0.2–0.45 clamp."""
    p = normalize_preset(preset)
    if p in ("strict", "broad", "custom"):
        if stored is None:
            return CHAT_PRESET_THRESHOLDS.get(p, CHAT_PRESET_THRESHOLDS["balanced"])
        return max(0.0, min(float(stored), 1.0))
    if stored is None:
        return CHAT_NULL_THRESHOLD
    return max(CHAT_LEGACY_THRESHOLD_FLOOR, min(float(stored), CHAT_LEGACY_THRESHOLD_CAP))


def clamp_keyword_blend(value: Optional[float]) -> Optional[float]:
    """0 = keyword only, 1 = vector only. None stays the live fusion path."""
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return max(0.0, min(1.0, n))


def fusion_weights(keyword_blend: Optional[float], *, large: bool) -> Tuple[float, float]:
    """``(semantic_weight, keyword_weight)``. None = today's live mix."""
    blend = clamp_keyword_blend(keyword_blend)
    if blend is None:
        if large:
            from .hybrid_fusion import KEYWORD_WEIGHT, SEMANTIC_WEIGHT

            return SEMANTIC_WEIGHT, KEYWORD_WEIGHT
        return SMALL_SEMANTIC_WEIGHT, SMALL_KEYWORD_WEIGHT
    return blend, 1.0 - blend


def resolve_threshold_write(surface: str, preset: Optional[str], stored: Optional[float]) -> tuple[str, float]:
    """Normalize a save: named presets write their float; editing the float sets custom."""
    p = normalize_preset(preset) or DEFAULT_PRESET
    named = preset_threshold(surface, p)
    if p != "custom" and named is not None:
        return p, named
    if stored is None:
        fallback = preset_threshold(surface, DEFAULT_PRESET) or 0.45
        return DEFAULT_PRESET, fallback
    return "custom", max(0.0, min(float(stored), 1.0))
