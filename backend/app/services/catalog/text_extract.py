"""Find the main item of a page from its stored text and title (no HTML, no site rules).

Signals used, in order of trust:

* breadcrumb trail at the top of the text (``Home / A / B / Item`` on one or several lines);
* the *anchor*: the line that best matches the page ``<title>`` (ads and carousels for other
  items barely overlap with the title, so they are never chosen);
* the first currency amount right after the anchor (add-on fees written ``+₹129`` are skipped),
  with a bigger plain amount just before it as the list price;
* ``Label: value`` lines and ``a | b`` rows near the anchor as attributes.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .normalize import identifiers_in, measures, money_in, plain_amount, tokens
from .page_cards import first_unsponsored_price, full_name, sponsored, truncated_title, with_variant

CRUMB_SEPARATORS = ("/", ">", "›", "»", "|", "→")
_INLINE_CRUMB = re.compile(r"\s(?:/|>|›|»|→)\s")
MAX_CRUMBS = 10
MAX_CRUMB_CHARS = 300
ANCHOR_WINDOW = 400
PRICE_LOOKAHEAD = 10
ATTR_WINDOW = 160
MIN_ANCHOR_COVERAGE = 0.6
LEAF_RESTATE_SHARE = 0.8
_LABEL_VALUE = re.compile(r"^([^\W\d_][\w .&/()+-]{0,40}?)\s*:\s*(.{1,120})$", re.U)
_AVAILABILITY = re.compile(
    r"\b(out of stock|sold out|coming soon|currently unavailable|in stock|available now|"
    r"nicht vorrätig|ausverkauft|auf lager|lieferbar|rupture de stock|en stock|agotado|disponible|esgotado)\b",
    re.I,
)
_STOP = frozenset("a an the and or of for with in on at to by from buy online price best india shop".split())


@dataclass
class PageItem:
    name: str
    crumbs: List[str] = field(default_factory=list)
    price: Optional[float] = None
    list_price: Optional[float] = None
    currency: Optional[str] = None
    availability: Optional[str] = None
    attributes: Dict[str, str] = field(default_factory=dict)
    spec_lines: List[str] = field(default_factory=list)
    identifiers: List[str] = field(default_factory=list)
    confidence: float = 0.0


def breadcrumb(lines: List[str]) -> Tuple[List[str], int]:
    """Leading breadcrumb trail and the number of lines it spans.

    Either ``A / B / C`` on one line or one crumb per line with separator lines between.
    """
    if not lines:
        return [], 0
    head = lines[0]
    if _INLINE_CRUMB.search(head) and len(head) <= 300:
        parts = [p.strip() for p in re.split(r"\s(?:/|>|›|»|→)\s", head) if p.strip()]
        return (parts[:MAX_CRUMBS], 1) if len(parts) >= 3 else ([], 0)
    crumbs: List[str] = []
    i = 0
    while i < len(lines) and len(crumbs) < MAX_CRUMBS:
        if len(lines[i]) > MAX_CRUMB_CHARS or lines[i] in CRUMB_SEPARATORS:
            break
        crumbs.append(lines[i])
        if i + 1 < len(lines) and lines[i + 1] in CRUMB_SEPARATORS:
            i += 2
        else:
            break
    return (crumbs, 2 * len(crumbs) - 1) if len(crumbs) >= 3 else ([], 0)


def _content_tokens(text: str) -> List[str]:
    return [t for t in tokens(text) if t not in _STOP]


def coverage(line: str, title_tokens: set) -> float:
    toks = set(_content_tokens(line))
    return len(toks & title_tokens) / len(toks) if toks else 0.0


def find_anchor(lines: List[str], title: str, start: int) -> Tuple[int, float]:
    """Line that best restates the title: high coverage *and* several matched words."""
    title_tokens = set(_content_tokens(title))
    title_ids = {i.lower() for i in identifiers_in(title)}
    best, best_score = -1, 0.0
    for i in range(start, min(len(lines), start + ANCHOR_WINDOW)):
        line = lines[i]
        toks = set(_content_tokens(line))
        if len(toks) < 2 or len(line) > 300 or sponsored(lines, i):
            continue
        line_ids = {x.lower() for x in identifiers_in(line)}
        if title_ids and line_ids and not line_ids & title_ids:
            continue  # another model's card ("SMS66GI01I" on the "SMS66GW01I" page)
        if truncated_title(line, title):
            return i, 1.0
        matched = len(toks & title_tokens)
        score = (matched / len(toks)) * min(matched, 10) / 10
        if score > best_score + 1e-9:
            best, best_score = i, score
    return best, best_score


def _title_is_specific(title: str) -> bool:
    """Item titles name a model (code, measure or many words); listing titles name a category."""
    return bool(identifiers_in(title)) or bool(re.search(r"\d", title)) or len(set(_content_tokens(title))) >= 8


def _with_brand_prefix(leaf: str, anchor_line: str) -> str:
    """``One 5G (Blue)`` + anchor ``Mivi One 5G ...`` -> ``Mivi One 5G (Blue)``."""
    leaf_toks, anchor_toks = tokens(leaf), tokens(anchor_line)
    if not leaf_toks or not anchor_toks or anchor_toks[0] == leaf_toks[0]:
        return leaf
    try:
        k = anchor_toks.index(leaf_toks[0])
    except ValueError:
        return leaf
    if not 0 < k <= 3:
        return leaf
    # Words, not tokens: "Ai+" is two tokens ("ai", "plus") but one word.
    prefix_words: List[str] = []
    seen = 0
    for word in anchor_line.split():
        if seen >= k:
            break
        prefix_words.append(word)
        seen += len(tokens(word))
    return f"{' '.join(prefix_words)} {leaf}" if seen == k else leaf


def _leaf_head_anchor(lines: List[str], crumbs: List[str], title_tokens: set, start: int) -> int:
    """Line restating a breadcrumb leaf whose model name (before any ``(variant)``) the title names.

    ``edge 70 pro (Tailored Fabric - Titan, 256 GB)`` under title ``MOTOROLA edge 70 pro (256 GB
    Storage)``: the variant words keep the full leaf below the coverage bar, the head does not.
    Listing leaves ("Samsung Mobiles") repeat a parent crumb and are skipped. When the title is
    a slogan ("Galaxy S25 | Flagship camera at ₹57,999") the restating line must carry the
    whole leaf, variant words included, so a sibling in a carousel is not taken for the item.
    """
    if len(crumbs) < 2:
        return -1
    leaf = set(_content_tokens(crumbs[-1]))
    head = set(_content_tokens(crumbs[-1].split("(")[0]))
    parents = {t for c in crumbs[:-1] for t in _content_tokens(c)}
    if len(head) < 2 or head & parents:
        return -1
    titled = head <= title_tokens
    for i in range(start, min(len(lines), start + ANCHOR_WINDOW)):
        toks = set(_content_tokens(lines[i]))
        if not head <= toks or len(toks) <= len(head) or len(lines[i]) > 300:
            continue
        if titled or len(leaf & toks) >= LEAF_RESTATE_SHARE * len(leaf):
            return i
    return -1


def _first_priced_restatement(
    lines: List[str], start: int, title_tokens: set, leaf_toks: set, *, stop: bool, skip: int = -1
) -> int:
    """First line restating the title (or the breadcrumb leaf) that a price follows."""
    for i in range(start, min(len(lines), start + ANCHOR_WINDOW)):
        toks = set(_content_tokens(lines[i]))
        if i == skip or len(toks) < 3 or sponsored(lines, i):
            continue
        # Name words, not just measures: a variant picker row "128 GB + 6 GB" restates no name.
        if len({t for t in toks & (title_tokens | leaf_toks) if t.isalpha() and len(t) > 2}) < 2:
            continue
        if coverage(lines[i], title_tokens) < MIN_ANCHOR_COVERAGE and not (leaf_toks and leaf_toks < toks):
            continue
        if _price_after(lines, i, stop_at_other_name=stop)[0] is not None:
            return i
    return -1


def _bare_amount(line: str) -> bool:
    """A line that is only an amount with its currency mark (``₹2,999``, ``EUR 12.50``)."""
    return len(re.sub(r"[\d.,\s]", "", line)) <= 3


def _name_like(line: str) -> bool:
    return len(line) >= 25 and len(set(_content_tokens(line))) >= 5 and not money_in(line)


def _price_after(
    lines: List[str], anchor: int, *, stop_at_other_name: bool = False
) -> Tuple[Optional[float], Optional[float], Optional[str]]:
    """First own price after the anchor. With ``stop_at_other_name`` a price that only comes
    after another item's name (a listing card) does not count."""
    for i in range(anchor + 1, min(len(lines), anchor + 1 + PRICE_LOOKAHEAD)):
        amounts = [a for a in money_in(lines[i]) if not a[2]]
        if not amounts:
            if stop_at_other_name and _name_like(lines[i]):
                return None, None, None
            continue
        price, currency, _ = amounts[0]
        list_price = None
        if len(amounts) > 1 and amounts[1][0] != price:
            price, list_price = min(price, amounts[1][0]), max(price, amounts[1][0])
        elif i + 1 < len(lines):
            # ``₹2,999`` then ``₹679``: a struck-through list price printed before the price.
            nxt = [a for a in money_in(lines[i + 1]) if not a[2]]
            if len(nxt) == 1 and nxt[0][0] < price and _bare_amount(lines[i]) and _bare_amount(lines[i + 1]):
                price, list_price = nxt[0][0], price
        for j in range(i - 1, max(anchor, i - 3), -1):
            prev = plain_amount(lines[j]) or next((a[0] for a in money_in(lines[j]) if not a[2]), None)
            if prev and prev > price:
                list_price = prev
                break
        return price, list_price, currency or None
    return None, None, None


def _attributes(lines: List[str], anchor: int) -> Tuple[Dict[str, str], List[str]]:
    attrs: Dict[str, str] = {}
    spec_lines: List[str] = []
    window = lines[anchor + 1: anchor + 1 + ATTR_WINDOW]
    for i, line in enumerate(window):
        if money_in(line) or any(money_in(nxt) for nxt in window[i + 1: i + 4]):
            continue
        m = _LABEL_VALUE.match(line)
        if m and len(attrs) < 40:
            attrs.setdefault(m.group(1).strip(), m.group(2).strip())
        elif len(spec_lines) < 24 and (
            (" | " in line and len(line) <= 160) or (len(line) <= 60 and measures(line))
        ):
            spec_lines.append(line)
    return attrs, spec_lines


def attributes_after_name(text: str, name: str) -> Tuple[Dict[str, str], List[str]]:
    """``Label: value`` rows after the first line naming ``name`` (an item known from schema.org).

    SEO titles ("Setting Spray for Dewy Finish, 16HR") often do not restate the item, so the
    title anchor misses; the structured name is printed verbatim above the buy box.
    """
    want = set(_content_tokens(name))
    if len(want) < 2:
        return {}, []
    lines = [ln.strip() for ln in (text or "").split("\n") if ln.strip()]
    for i, line in enumerate(lines[:ANCHOR_WINDOW]):
        if len(line) <= 300 and want <= set(_content_tokens(line)) and not sponsored(lines, i):
            return _attributes(lines, i)
    return {}, []


def extract_page_item(title: str, text: str) -> Optional[PageItem]:
    """Main item of a page, or ``None`` when the page is not about one item (listing, article)."""
    lines = [ln.strip() for ln in (text or "").split("\n") if ln.strip()]
    if not lines or not title:
        return None
    crumbs, start = breadcrumb(lines)
    title_tokens = set(_content_tokens(title))
    leaf = crumbs[-1] if crumbs else ""
    leaf_cov = coverage(leaf, title_tokens) if leaf else 0.0
    leaf_ok = leaf_cov >= MIN_ANCHOR_COVERAGE and len(set(_content_tokens(leaf))) >= 2
    anchor, _score = find_anchor(lines, title, start)
    anchor_line = lines[anchor] if anchor >= 0 else ""
    anchor_cov = coverage(anchor_line, title_tokens) if anchor_line else 0.0
    anchor_ok = (
        anchor_cov >= MIN_ANCHOR_COVERAGE
        and len(set(_content_tokens(anchor_line))) >= 3
        and _title_is_specific(title)
    )
    weak_anchor = anchor_cov < MIN_ANCHOR_COVERAGE
    if not leaf_ok:
        head_anchor = _leaf_head_anchor(lines, crumbs, title_tokens, start)
        if head_anchor >= 0 and _price_after(lines, head_anchor)[0] is not None:
            leaf_ok, leaf_cov, anchor, weak_anchor = True, MIN_ANCHOR_COVERAGE, head_anchor, False
            anchor_line = lines[anchor]
    if not (leaf_ok or anchor_ok):
        return None
    if leaf_ok and weak_anchor:
        # Nothing restates the item but ad cards and look-alikes: take the buy box instead.
        box = first_unsponsored_price(lines, start, ANCHOR_WINDOW)
        if box > 0:
            anchor, anchor_line = box - 1, ""
    if anchor < 0:
        anchor = max(0, start - 1)
    leaf_toks = set(_content_tokens(leaf)) if leaf_ok else set()
    price, list_price, currency = _price_after(lines, anchor, stop_at_other_name=not leaf_ok)
    if price is None:
        # The best restatement can be a description far below the buy box.
        alt = _first_priced_restatement(lines, start, title_tokens, leaf_toks, stop=not leaf_ok, skip=anchor)
        if alt >= 0:
            anchor, anchor_line = alt, lines[alt]
            price, list_price, currency = _price_after(lines, alt, stop_at_other_name=not leaf_ok)
    if not leaf_ok and price is None:
        return None
    attrs, spec_lines = _attributes(lines, anchor)
    if leaf_ok:
        name = with_variant(_with_brand_prefix(leaf, anchor_line), anchor_line) if anchor_line else leaf
    else:
        name = full_name(anchor_line, title)
    window = "\n".join(lines[anchor: anchor + 30])
    avail = _AVAILABILITY.search(window)
    idents = identifiers_in(title) + [v for k, v in attrs.items() if re.search(r"model|sku|mpn|part|art|item|ean|gtin|isbn", k, re.I)]
    confidence = 0.3 + 0.3 * max(anchor_cov, leaf_cov) + (0.2 if price else 0.0) + (0.2 if leaf_ok else 0.0)
    return PageItem(
        name=name, crumbs=crumbs, price=price, list_price=list_price, currency=currency,
        availability=avail.group(1).lower() if avail else None, attributes=attrs, spec_lines=spec_lines,
        identifiers=list(dict.fromkeys(i for i in idents if i))[:10], confidence=round(min(confidence, 1.0), 2),
    )
