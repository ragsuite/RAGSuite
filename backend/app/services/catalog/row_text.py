"""One item row as prompt text: name, brand, price (with MRP), stock, highlights, short fields."""
from __future__ import annotations

from typing import List, Optional, Sequence, Set

from .answer_checks import conflicting_list_prices
from .index import Entry
from .normalize import tokens

_SYMBOLS = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£", "JPY": "¥"}
MAX_HIGHLIGHTS = 6
MAX_FIELDS = 4
MAX_FIELD_CHARS = 60


def money(amount: Optional[float], currency: Optional[str]) -> str:
    if amount is None:
        return ""
    value = f"{amount:,.0f}" if amount == int(amount) else f"{amount:,.2f}"
    sym = _SYMBOLS.get((currency or "").upper())
    return f"{sym}{value}" if sym else f"{value} {currency or ''}".strip()


def price_order(rows: Sequence[Entry]) -> str:
    """Compared rows from lowest to highest selling price ("" unless every row has one, in one
    currency): small models misjudge which of two prices is lower, or let stock decide."""
    if len(rows) < 2 or any(e.price is None for e in rows):
        return ""
    if len({(e.currency or "").upper() for e in rows}) > 1:
        return ""
    ordered = sorted(rows, key=lambda e: e.price)
    named = "; ".join(f"{e.display_name} {money(e.price, e.currency)}" for e in ordered)
    return f"Selling prices, lowest first: {named}. Stock does not change which is cheaper."


def _row_fields(e: Entry, asked: Set[str], cap: int) -> List[str]:
    """Short ``label: value`` fields, the ones the question names first."""
    short = [
        (k, v) for k, v in (e.fields or {}).items()
        if isinstance(v, (str, int, float)) and 0 < len(str(v)) <= MAX_FIELD_CHARS
    ]
    short.sort(key=lambda kv: not (asked & set(tokens(str(kv[0])))))
    return [f"{k}: {v}" for k, v in short[:cap]]


def row_line(
    n: int, e: Entry, passage: Optional[int], ranked: str = "",
    *, asked: Set[str] = frozenset(), field_cap: int = MAX_FIELDS,
) -> str:
    parts = [f"{n}. {e.display_name}"]
    if ranked:
        parts.append(ranked)
    if e.brand:
        parts.append(f"brand: {e.brand}")
    if e.price is not None:
        price = money(e.price, e.currency)
        if e.list_price and e.list_price > e.price:
            price += f" (MRP {money(e.list_price, e.currency)})"
        for label, amount in conflicting_list_prices(e):
            price += f"; the details also state {label} {money(amount, e.currency)} (state both values)"
        parts.append(f"price: {price}")
    if e.availability:
        parts.append(e.availability)
    if e.highlights:
        parts.append("; ".join(e.highlights[:MAX_HIGHLIGHTS]))
    short_fields = _row_fields(e, set(asked), field_cap)
    if short_fields:
        parts.append("; ".join(short_fields))
    if passage:
        parts.append(f"page [S{passage}]")
    return " — ".join(parts)
