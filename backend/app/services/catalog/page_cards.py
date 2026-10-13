"""Tell the page's own item heading apart from promoted cards repeating its name.

* A sponsored card carries an ad label right after its price lines; the item never does.
* The item heading is often the page title cut with an ellipsis
  (``Acme Strider Air Cushion Walking Sh...``); listing cards print their own full names.
"""
from __future__ import annotations

import re
from typing import List

from .normalize import money_in

PRICE_LOOKAHEAD = 10
MIN_TRUNCATED_HEAD = 25
AD_LABELS = frozenset({"ad", "ads", "sponsored", "advertisement", "anzeige", "gesponsert", "publicité",
                       "sponsorisé", "patrocinado", "anuncio", "anúncio", "广告", "赞助", "إعلان", "ممول"})
_ELLIPSIS = re.compile(r"\s*(?:\.\.\.|…)$")
# Shop suffixes of a <title>: "Acme Strider ... For Men - Buy Acme Strider ... Online at ..."
_TITLE_TAIL = re.compile(r"\s+(?:[-|–:]\s+(?:buy|shop|order)\b|\|\s).*$", re.I)


def sponsored(lines: List[str], i: int) -> bool:
    """Name line of a sponsored card. A label *before* a name proves nothing: it often
    closes the previous card."""
    end = min(len(lines), i + 1 + PRICE_LOOKAHEAD)
    j = next((k for k in range(i + 1, end) if money_in(lines[k])), None)
    if j is None:
        return False
    while j < len(lines) and money_in(lines[j]):
        j += 1
    return j < len(lines) and lines[j].lower() in AD_LABELS


def _own_amount(line: str) -> bool:
    return any(not a[2] for a in money_in(line))


def first_unsponsored_price(lines: List[str], start: int, window: int) -> int:
    """First price line after ``start`` that does not close a sponsored card, or -1.

    Used when no line restates the item: the buy box is then the first price that is not
    an ad, since promoted cards sit above it."""
    j, end = start, min(len(lines), start + window)
    while j < end:
        if not _own_amount(lines[j]):
            j += 1
            continue
        k = j
        while k < len(lines) and money_in(lines[k]):
            k += 1
        if k < len(lines) and lines[k].lower() in AD_LABELS:
            j = k + 1
            continue
        return j
    return -1


def with_variant(name: str, anchor_line: str) -> str:
    """``Ebony Gas Stove`` + heading ``Acme Ebony Gas Stove (4 Burners)`` -> ``Ebony Gas Stove (4 Burners)``:
    sibling pages share the breadcrumb name and differ only in the variant."""
    if "(" in name or not anchor_line:
        return name
    m = re.search(re.escape(" ".join(name.split())) + r"\s*(\([^()]{1,60}\))", " ".join(anchor_line.split()), re.I)
    return f"{name} {m.group(1)}" if m else name


def _head(line: str) -> str:
    m = _ELLIPSIS.search(line)
    return " ".join(line[: m.start()].split()) if m else ""


def truncated_title(line: str, title: str) -> bool:
    head = _head(line).lower()
    return len(head) >= MIN_TRUNCATED_HEAD and head in " ".join(title.lower().split())


def full_name(line: str, title: str) -> str:
    """Complete a truncated heading from the title (shop suffix removed); else the line."""
    head = _head(line)
    flat = " ".join(title.split())
    at = flat.lower().find(head.lower()) if head else -1
    if at < 0:
        return _ELLIPSIS.sub("", line).strip()
    name = _TITLE_TAIL.sub("", flat[at:]).strip()
    return name if len(name) >= len(head) else head
