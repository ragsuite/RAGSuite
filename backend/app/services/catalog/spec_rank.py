"""Ranking items by a measured attribute ("which has the biggest battery?", "most RAM").

The values come from the records themselves: the measure written in the same spec segment
as the attribute word ("Battery Capacity: 7000 mAh", "8 GB RAM"). Nothing here knows a
particular attribute or unit; the unit is whichever one those segments use most.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from .category_match import fold_plural
from .index import Entry
from .normalize import measures, tokens

_MAX_WORDS = r"biggest|largest|highest|maximum|max|most|longest|greatest|strongest|bigger|larger|higher|more"
_MIN_WORDS = r"smallest|lowest|least|minimum|min|shortest|lightest|smaller|lower|less"
_ATTR = r"((?:[^\W\d_]+\s+)?[^\W\d_]+)"
_RANK_RX = re.compile(rf"\b(?:(?P<max>{_MAX_WORDS})|(?P<min>{_MIN_WORDS}))\s+(?:the\s+)?{_ATTR}", re.I | re.U)
# Price wording keeps its own (price) ordering; "more than" is a filter, not a ranking.
_NOT_ATTRIBUTE = frozenset(
    "price prices priced cost costs expensive costly cheap cheaper budget money rupees than options items "
    "products models one ones popular rated sold selling".split()
)
_TRAILING = frozenset("one ones".split())
_SEGMENT_SPLIT = re.compile(r"[|;,()\n]|\s-\s")


@dataclass
class Rank:
    attribute: str
    descending: bool
    span: Tuple[int, int]
    unit: str = ""
    values: Dict[str, float] = field(default_factory=dict)

    def label(self) -> str:
        edge = "largest" if self.descending else "smallest"
        return f"{edge} {self.attribute}" + (f" ({self.unit})" if self.unit else "")


def rank_request(query: str) -> Optional[Rank]:
    """The attribute the question ranks by, or ``None`` (price superlatives stay price)."""
    for m in _RANK_RX.finditer(query or ""):
        words = [w for w in tokens(m.group(3)) if w not in ("the", "a")]
        while len(words) > 1 and words[-1] in _TRAILING:
            words.pop()
        if not words or any(w in _NOT_ATTRIBUTE for w in words):
            continue
        return Rank(" ".join(words), descending=bool(m.group("max")), span=m.span())
    return None


def _segments(e: Entry) -> List[str]:
    parts = [e.name, *e.highlights, *(f"{k}: {v}" for k, v in (e.fields or {}).items())]
    return [s.strip() for part in parts for s in _SEGMENT_SPLIT.split(part or "") if s.strip()]


def _mentions(segment: str, words: Sequence[str]) -> bool:
    seg = set(tokens(segment))
    return all(any(form in seg for form in fold_plural(w)) for w in words)


def _candidates(e: Entry, words: Sequence[str]) -> List[Tuple[str, float]]:
    return [(m.unit, m.value) for s in _segments(e) if _mentions(s, words) for m in measures(s)]


def apply(rank: Rank, rows: List[Entry]) -> List[Entry]:
    """Rows ordered by the attribute (items without a value last); fills ``rank.values``.

    Returns ``rows`` unchanged when no row states the attribute with a measure.
    """
    words = rank.attribute.split()
    # "screen size" may be written "Display Size": fall back to single words, last first.
    for attempt in [words, *([[w] for w in reversed(words)] if len(words) > 1 else [])]:
        found = {e.document_id: _candidates(e, attempt) for e in rows}
        units: Dict[str, int] = {}
        for cands in found.values():
            for unit in {u for u, _ in cands}:
                units[unit] = units.get(unit, 0) + 1
        if units:
            break
    if not units:
        return rows
    rank.unit = max(units.items(), key=lambda kv: kv[1])[0]
    pick = max if rank.descending else min
    for doc_id, cands in found.items():
        vals = [v for u, v in cands if u == rank.unit]
        if vals:
            rank.values[doc_id] = pick(vals)

    def key(e: Entry):
        v = rank.values.get(e.document_id)
        if v is None:
            return (1, 0.0, e.price or 0.0)
        return (0, -v if rank.descending else v, e.price or 0.0)

    return sorted(rows, key=key)
