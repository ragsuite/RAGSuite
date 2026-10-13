"""Several named items in one question ("compare A and B", "A vs B", "which is cheaper, A or B?").

The question is split at the conjunctions between the names and each part is looked up on
its own, so every item gets its rows (one lookup over the whole question finds only one).
"""
from __future__ import annotations

import re
from typing import Any, Callable, List, Optional, Tuple

from .cues import NOISE
from .index import CatalogIndex, Entry
from .normalize import tokens

MAX_ITEMS = 4
ROWS_PER_ITEM = 3
COMPARE_RX = re.compile(
    r"\b(compare|comparison|vs\.?|versus|difference between|unterschied|vergleich\w*|"
    r"which (?:[\w-]+ ){0,2}?(?:is|are) (?:cheaper|better|costlier|more expensive))\b",
    re.I,
)
_LEAD_RX = re.compile(
    r"^.*?\b(?:compare|comparison (?:of|between)|difference between|vergleiche?|unterschied zwischen)\s+"
    r"(?:the\s+)?(?:prices?\s+(?:of\s+)?)?",
    re.I,
)
_SPLIT_RX = re.compile(r"\s*(?:\bvs\.?|\bversus\b|\band\b|\bor\b|\bwith\b|\bund\b|\boder\b|&|,|:|\?)\s*", re.I)

Lookup = Callable[[CatalogIndex, str, List[str], Optional[str]], Any]


def _names_something(part: str) -> bool:
    """A part that reads like a product name (capitalised or with a number), not filler."""
    content = [t for t in tokens(part) if t not in NOISE]
    return len(content) >= 2 and bool(re.search(r"[A-Z0-9]", part))


def parts(query: str) -> List[str]:
    if not COMPARE_RX.search(query or ""):
        return []
    body = _LEAD_RX.sub("", query, count=1)
    return [p.strip() for p in _SPLIT_RX.split(body) if len(tokens(p)) >= 1][: MAX_ITEMS + 2]


def compared_items(index: CatalogIndex, query: str, lookup: Lookup) -> Optional[Tuple[List[Entry], List[str], bool]]:
    """``(rows, names not found, all exact)`` when two or more parts name items, else ``None``.

    ``lookup(index, text, q_tokens, superlative)`` returns the single-item result or ``None``.
    """
    found: List[List[Entry]] = []
    missing: List[str] = []
    exact = True
    for part in parts(query):
        hit = lookup(index, part, tokens(part), None)
        if hit is None or not hit.rows:
            if _names_something(part):
                missing.append(part)
            continue
        if any(hit.rows[0] is rows[0] for rows in found):
            continue
        found.append(hit.rows[:ROWS_PER_ITEM])
        exact = exact and hit.exact
    if len(found) + len(missing) < 2 or not found:
        return None
    if len(found) < 2 and not missing:
        return None
    rows = [e for group in found[:MAX_ITEMS] for e in group]
    return rows, missing, exact
