"""Query-time constraint boost: soft reorder of candidates by price/rating/entity fit.

Chunks carry no structured price/brand metadata, so values are parsed from the
chunk text. Candidates are only reordered (stable) — never dropped, never
annotated with invented metadata — and nothing changes unless at least one
candidate positively matches.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Sequence, Tuple

_CUR = r"(?:₹|\$|€|£|¥|rs\.?|inr|usd|eur|gbp)"
_AMOUNT = r"\d[\d.,]*"
_PRICE_RX = re.compile(
    rf"{_CUR}\s*({_AMOUNT})|({_AMOUNT})\s*(?:{_CUR}|rupees|euros?|dollars?)",
    re.IGNORECASE,
)
_RATING_RX = re.compile(
    r"(\d(?:[.,]\d)?)\s*(?:★|stars?|sterne|étoiles|estrellas|out of 5|/\s*5\b)"
    r"|rating[s]?\s*[:\-]?\s*(\d(?:[.,]\d)?)",
    re.IGNORECASE,
)
_MAX_SCAN_CHARS = 6000
_ENTITY_BONUS = 0.5
_MAX_ENTITY_BONUS = 1.0


def parse_amount(raw: str) -> Optional[float]:
    """Locale-tolerant amount: ``49,999`` / ``1,00,000`` / ``49.999`` / ``49,99`` / ``1.299,00``."""
    text = (raw or "").strip(".,")
    if not text:
        return None
    if re.fullmatch(r"\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d+)?", text):
        text = text.replace(",", "")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+(?:,\d+)?", text):
        text = text.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d+,\d{1,2}", text):
        text = text.replace(",", ".")
    else:
        text = text.replace(",", "")
    try:
        return float(text)
    except ValueError:
        return None


def prices_in(text: str) -> List[float]:
    out: List[float] = []
    for m in _PRICE_RX.finditer((text or "")[:_MAX_SCAN_CHARS]):
        value = parse_amount(m.group(1) or m.group(2) or "")
        if value is not None and value > 0:
            out.append(value)
    return out


def ratings_in(text: str) -> List[float]:
    out: List[float] = []
    for m in _RATING_RX.finditer((text or "")[:_MAX_SCAN_CHARS]):
        raw = (m.group(1) or m.group(2) or "").replace(",", ".")
        try:
            value = float(raw)
        except ValueError:
            continue
        if 0 < value <= 5:
            out.append(value)
    return out


def _price_score(prices: Sequence[float], lo: Optional[float], hi: Optional[float]) -> float:
    if not prices or (lo is None and hi is None):
        return 0.0
    fits = [p for p in prices if (lo is None or p >= lo) and (hi is None or p <= hi)]
    return 1.0 if fits else -1.0


def _rating_score(ratings: Sequence[float], minimum: Optional[float]) -> float:
    if minimum is None or not ratings:
        return 0.0
    return 1.0 if max(ratings) >= minimum else -1.0


def _entity_score(text_lower: str, entities: Sequence[str]) -> float:
    bonus = sum(_ENTITY_BONUS for e in entities if e and e.lower() in text_lower)
    return min(bonus, _MAX_ENTITY_BONUS)


def score_text(text: str, constraints: Dict[str, Any], entities: Sequence[str] = ()) -> float:
    lowered = (text or "")[:_MAX_SCAN_CHARS].lower()
    return (
        _price_score(prices_in(text), constraints.get("price_min"), constraints.get("price_max"))
        + _rating_score(ratings_in(text), constraints.get("rating_min"))
        + _entity_score(lowered, entities)
    )


def boost_entries(
    entries: List[Dict[str, Any]],
    constraints: Optional[Dict[str, Any]],
    entities: Sequence[str] = (),
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Stable reorder of fused ``entries`` (``{"doc", "id", "meta", "dist"}``) by fit.

    Returns ``(entries, info)``; ``entries`` is the input order when nothing matched.
    """
    constraints = constraints or {}
    has_numeric = any(k in constraints for k in ("price_min", "price_max", "rating_min"))
    if not entries or (not has_numeric and not entities):
        return entries, {"applied": False, "reason": "no_constraints"}
    scores = [score_text(e.get("doc") or "", constraints, entities) for e in entries]
    matched = sum(1 for s in scores if s > 0)
    if matched == 0:
        return entries, {"applied": False, "reason": "no_match", "candidates": len(entries)}
    order = sorted(range(len(entries)), key=lambda i: -scores[i])
    reordered = [entries[i] for i in order]
    info = {
        "applied": order != list(range(len(entries))),
        "reason": "ok",
        "candidates": len(entries),
        "matched": matched,
        "demoted": sum(1 for s in scores if s < 0),
    }
    return reordered, info


def boost_location_evidence(
    entries: List[Dict[str, Any]],
    user_query: str,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Stable-reorder HQ/address chunks ahead of brand-only text. Never drops."""
    from ..source_display_policy import (
        chunk_has_location_evidence,
        chunk_has_query_anchor_match,
        chunk_source_haystack,
        user_query_asks_geographic_location,
    )

    if not entries:
        return entries, {"applied": False, "reason": "empty"}
    if not user_query_asks_geographic_location(user_query):
        return entries, {"applied": False, "reason": "not_geo"}
    scores = []
    for entry in entries:
        haystack = chunk_source_haystack(entry.get("doc") or "", entry.get("meta"))
        hit = chunk_has_query_anchor_match(user_query, haystack) and chunk_has_location_evidence(
            haystack
        )
        scores.append(1.0 if hit else 0.0)
    matched = sum(1 for score in scores if score > 0)
    if matched == 0:
        return entries, {"applied": False, "reason": "no_match", "candidates": len(entries)}
    order = sorted(range(len(entries)), key=lambda i: -scores[i])
    reordered = [entries[i] for i in order]
    return reordered, {
        "applied": order != list(range(len(entries))),
        "reason": "ok",
        "candidates": len(entries),
        "matched": matched,
    }
