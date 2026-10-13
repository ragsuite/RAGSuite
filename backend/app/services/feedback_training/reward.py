"""Reward reorder: chunks from sources cited by trained answers move up or down, never out."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import urlsplit, urlunsplit

PENALTY_SCALE = 0.5
MAX_URL_SCORE = 1.0

# Disliked for these reasons, the cited sources were (part of) the problem; other negative
# reasons (tone, formatting, speed) say nothing about source choice, so they do not demote.
SOURCE_BLAME_TAGS = frozenset(
    {"incorrect", "hallucinated", "missing_sources", "outdated_information", "low_quality", "accuracy", "relevance"}
)


def normalize_url(url: Optional[str]) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    try:
        parts = urlsplit(raw)
    except ValueError:
        return raw.rstrip("/").lower()
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, parts.query, ""))


def blames_sources(reward: int, reason_tags: Iterable[str]) -> bool:
    tags = {str(t) for t in reason_tags or ()}
    return reward < 0 and (not tags or bool(tags & SOURCE_BLAME_TAGS))


def url_scores(matches: Sequence[Any]) -> Dict[str, float]:
    """Summed match weight per normalized URL, clamped to ``±MAX_URL_SCORE``."""
    scores: Dict[str, float] = defaultdict(float)
    for match in matches:
        example = match.example
        if example.reward < 0 and not blames_sources(example.reward, example.reason_tags):
            continue
        scale = 1.0 if example.reward > 0 else PENALTY_SCALE
        for url in example.cited_urls:
            key = normalize_url(url)
            if key:
                scores[key] += match.weight * scale
    return {u: max(-MAX_URL_SCORE, min(MAX_URL_SCORE, s)) for u, s in scores.items() if s}


def _entry_url(entry: Dict[str, Any]) -> str:
    meta = entry.get("meta") or {}
    return normalize_url(meta.get("url") or meta.get("source_url") or meta.get("source"))


def rerank_entries(
    entries: List[Dict[str, Any]], matches: Sequence[Any]
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Stable reorder of fused ``entries`` by learned URL reward; the input order if nothing applies."""
    if not entries or not matches:
        return entries, {"applied": False, "reason": "no_match"}
    scores = url_scores(matches)
    if not scores:
        return entries, {"applied": False, "reason": "no_source_signal"}
    entry_scores = [scores.get(_entry_url(e), 0.0) for e in entries]
    order = sorted(range(len(entries)), key=lambda i: -entry_scores[i])
    return [entries[i] for i in order], {
        "applied": order != list(range(len(entries))),
        "reason": "ok",
        "boosted": sum(1 for s in entry_scores if s > 0),
        "demoted": sum(1 for s in entry_scores if s < 0),
    }
