"""Which rows of a matching set to show: duplicates, ties and mixed-category listings."""
from __future__ import annotations

from typing import Any, Dict, List, Set, Tuple

from .cues import UNAVAILABLE_RX
from .index import Entry

MAX_TIED = 3


def unavailable(e: Entry) -> bool:
    return bool(e.availability and UNAVAILABLE_RX.search(e.availability))


def in_stock_first(rows: List[Entry]) -> List[Entry]:
    """Items that can be bought now before out-of-stock ones, keeping the order within each."""
    return sorted(rows, key=unavailable)


def unique(rows: List[Entry]) -> List[Entry]:
    """One row per item name and price: the same item listed on several pages is one answer,
    while same-named variants at different prices (2 vs 4 burners) stay apart."""
    seen: Set[Tuple[str, Any]] = set()
    out: List[Entry] = []
    for e in rows:
        key = (e.name_key, e.price)
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    return out


def tied_top(rows: List[Entry]) -> List[Entry]:
    """The first row plus rows sharing its price (equally cheapest / most expensive)."""
    if not rows:
        return []
    top = rows[0].price
    return [e for e in rows if e.price == top][:MAX_TIED] if top is not None else rows[:1]


def models_first(rows: List[Entry]) -> List[Entry]:
    """One row per model (variant group) in the given order, then the remaining variants."""
    seen: Set[str] = set()
    first: List[Entry] = []
    rest: List[Entry] = []
    for e in rows:
        key = e.variant_group or e.name_key
        (rest if key in seen else first).append(e)
        seen.add(key)
    return first + rest


def spread_categories(rows: List[Entry], limit: int) -> Tuple[List[Entry], List[List[Any]]]:
    """Rows taken round-robin across categories, largest category first, and the counts.

    A brand listing ("products from vivo") shows its main lines first instead of the
    cheapest accessories, and distinct models before colour/storage variants of one model.
    Items without a category come last: their pages are the least certain to be products.
    """
    groups: Dict[str, List[Entry]] = {}
    for e in rows:
        groups.setdefault(e.category or "", []).append(e)
    groups = {name: models_first(items) for name, items in groups.items()}
    ordered = sorted(groups.items(), key=lambda kv: (not kv[0], -len(kv[1]), kv[0].lower()))
    counts = [[name, len(items)] for name, items in ordered if name]
    out: List[Entry] = []
    depth = 0
    while len(out) < limit and any(depth < len(items) for _, items in ordered):
        for _, items in ordered:
            if depth < len(items) and len(out) < limit:
                out.append(items[depth])
        depth += 1
    return out, counts
