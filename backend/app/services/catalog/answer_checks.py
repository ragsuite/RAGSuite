"""Checks of a model answer against item rows: quoted prices, the leading item and denials."""
from __future__ import annotations

import re
from typing import List, Sequence, Set, Tuple

from .index import Entry
from .normalize import parse_amount, tokens
from .query import NOISE

_LIST_PRICE_LABELS = frozenset({"mrp", "msrp", "rrp", "uvp"})
_NUMBER_RE = re.compile(r"\d[\d,.]*\d|\d")
_CURRENCY = r"(?:[₹$€£¥]|\b(?:rs|inr|usd|eur|gbp)\b\.?)\s?"
_AMOUNT_RE = re.compile(_CURRENCY + r"\d", re.I)
_AMOUNT_VALUE_RE = re.compile(_CURRENCY + r"(\d[\d,.]*)", re.I)
# "No relevant information about X is available" style answers that never emit the
# out-of-context sentinel.
_DENIAL_RE = re.compile(
    r"\bno\s+(?:relevant\s+|specific\s+|such\s+)?(?:information|details|data|mention|products?|items?)\b"
    r"|\b(?:is|are)(?:\s+not|n't)\s+(?:available|listed|mentioned|included|found)\b"
    r"|\b(?:do|does|did|could|can)(?:\s+not|n't)\s+(?:find|have|contain|locate|see|mention)\b"
    r"|\bcannot\s+(?:find|locate|see)\b|\bunable\s+to\s+(?:find|locate)\b",
    re.I,
)
_CLAUSE_SPLIT_RE = re.compile(
    r"(?<=[.!?])\s+|\n+|[,;]\s+|\s+(?:but|while|whereas|although|though|however)\s+", re.I
)
_FALLBACK_MIN_NEW_WORDS = 4


def price_spellings(amount: float) -> List[str]:
    """How a page may print ``amount``: ``13,999`` / ``13.999`` / ``1,09,999`` / ``13999``."""
    whole = int(round(amount))
    western = f"{whole:,}"
    out = [western, western.replace(",", "."), str(whole)]
    digits = str(whole)
    if len(digits) > 5:
        head, tail = digits[:-3], digits[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        out.append(",".join([head, *groups, tail]) if head else ",".join([*groups, tail]))
    return list(dict.fromkeys(out))


def quotes_price(e: Entry, answer: str) -> bool:
    if e.price is None:
        return False
    return any(re.search(rf"(?<![\d.,]){re.escape(s)}(?!\d)", answer) for s in price_spellings(e.price))


def states_price(top: Entry, answer: str) -> bool:
    """An answer that quotes amounts must quote the row's price (shared feature words
    like "glass automatic" can make another model's name look like the row's)."""
    if top.price is None or not _AMOUNT_RE.search(answer or ""):
        return True
    return quotes_price(top, answer)


def _amount_values(raw: str) -> Set[float]:
    """``17,165`` / ``1,09,999`` / ``13.999`` / ``89.90`` -> candidate numeric values."""
    out = {float(re.sub(r"[.,]", "", raw))}
    try:
        out.add(float(raw.replace(",", "")))
    except ValueError:
        pass
    return out


def priced_mentions(answer: str) -> List[Tuple[str, Set[float]]]:
    """``(text since the previous amount, values of this amount)`` per quoted amount: the item
    an answer prices is named right before its price ("**X** — ₹161 (MRP ₹249)")."""
    out: List[Tuple[str, Set[float]]] = []
    start = 0
    for m in _AMOUNT_VALUE_RE.finditer(answer or ""):
        out.append((answer[start:m.start()], _amount_values(m.group(1).rstrip(".,"))))
        start = m.end()
    return out


def conflicting_list_prices(e: Entry) -> List[Tuple[str, float]]:
    """``(label, amount)`` of list prices in the detail rows ("MRP: 899") that match neither
    the item's price nor its list price: the page prints two different values."""
    known = {v for v in (e.price, e.list_price) if v is not None}
    if not known:
        return []
    out: List[Tuple[str, float]] = []
    for label, value in (e.fields or {}).items():
        if not set(tokens(str(label))) & _LIST_PRICE_LABELS:
            continue
        m = _NUMBER_RE.search(str(value))
        amount = parse_amount(m.group(0)) if m else None
        if amount is not None and amount not in known:
            out.append((str(label), amount))
    return out


def leads_with_row(rows: Sequence[Entry], answer: str, bounds: Sequence[float]) -> bool:
    """The first amount a one-item answer quotes (filter bounds aside) is a row's price or MRP."""
    allowed = {v for e in rows for v in (e.price, e.list_price) if v is not None}
    allowed |= {amount for e in rows for _, amount in conflicting_list_prices(e)}
    if not allowed:
        return True
    for m in _AMOUNT_VALUE_RE.finditer(answer or ""):
        values = _amount_values(m.group(1).rstrip(".,"))
        if values & set(bounds):
            continue
        return bool(values & allowed)
    return True


def _adds_facts(answer: str, known: Set[str]) -> bool:
    """Clauses besides the denial say something the question did not ("the expiry date is
    not stated. It is waterproof and long-wearing …"): the answer falls back to related facts."""
    rest = " ".join(s for s in _CLAUSE_SPLIT_RE.split(answer or "") if not _DENIAL_RE.search(s))
    added = {t for t in tokens(rest) if len(t) > 2 and t not in NOISE and t not in known}
    return len(added) >= _FALLBACK_MIN_NEW_WORDS


def denies_rows(rows: Sequence[Entry], answer: str, asked: str) -> bool:
    """The answer says the item isn't there and uses nothing from the rows.

    "Yellow is not listed; the colours are Tea Green, Titan Blue" denies an attribute while
    citing row details (words the question did not contain); a refusal only echoes the question.
    """
    priced = [e for e in rows if e.price is not None]
    if not priced or not _DENIAL_RE.search(answer or ""):
        return False
    if any(quotes_price(e, answer) for e in priced):
        return False
    vocab = {t for e in rows for t in tokens(" ".join([e.display_name, *e.highlights]))}
    known = set(tokens(asked or ""))
    if _adds_facts(answer, known):
        return False
    return not any(t in vocab and t not in known and len(t) > 2 and t not in NOISE for t in tokens(answer))
