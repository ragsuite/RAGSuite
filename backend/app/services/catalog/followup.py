"""Follow-up item questions: "which one is the cheapest?", "what is its price?", "and the mixer grinder?".

The scope of the previous item answer (categories, brands, filters and the items shown) is
stored on the assistant turn. A follow-up inherits whatever it does not restate itself:
a new category keeps the brand of a brand listing, a bare superlative keeps the category
and filters, and a question with no item words at all is about the item(s) just shown.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from ..rag.query_processing import asks_selection, points_back, refers_back
from ..rag.query_signals import extract_constraints
from .index import CatalogIndex
from .normalize import identifiers_in, measures, tokens
from . import variants
from .query import BRANDS_RX, HIGH_RX, LOW_RX, NOISE, SPECIFIC_MIN_IDF_SHARE, TOP_N_RX, CatalogResult, lookup_item
from .spec_rank import rank_request
from .terms import item_tokens

MAX_ITEMS = 5
_LIST_MODES = ("list", "brands")
CATALOG_WIDE_RX = re.compile(
    r"\b(products?|items?|everything|catalog(?:ue)?|produkte?|artikel|produits?|articles?|productos?|"
    r"art[ií]culos?|produtos?|itens|prodott[oi]|articoli|producten)\b|产品|商品|منتجات",
    re.I,
)
# "and laptops?", "what about air fryers?", "I mean from water purifiers": the previous
# question, asked of something else.
_LINK_RX = re.compile(
    r"^\s*(?:and|also|what about|how about|same for|und|et|y|e|aur|or)\b"
    r"|^\W*(?:(?:no|sorry|oh)\W+)?i\s+(?:mean|meant)\b",
    re.I,
)
# "laptops?", "cheapest laptop": a one- or two-word turn keeps the previous question's
# filters, but only a linked turn keeps its brand in another category.
_SHORT_RX = re.compile(r"^\W*\w+(?:\s+\w+)?\W*$")
# "the air conditioners" right after a brand's items: that brand's air conditioners.
_DEFINITE_RX = re.compile(r"\b(?:the|those|these|its|their)\b", re.I)
# "with 8 GB RAM", "only the black ones", "under 30k": a refinement of the listed items.
_REFINE_RX = re.compile(r"^\s*(?:with|without|only|just|but|under|below|above|over|less than|more than|having)\b", re.I)
_SORT_WORDS = {"low": "cheapest", "high": "most expensive"}


@dataclass
class Scope:
    mode: str = ""
    query: str = ""
    categories: List[str] = field(default_factory=list)
    brands: List[str] = field(default_factory=list)
    filters: Dict[str, Any] = field(default_factory=dict)
    items: List[str] = field(default_factory=list)
    sort: Optional[str] = None

    @classmethod
    def of(cls, result: CatalogResult) -> "Scope":
        rows = result.rows or result.closest
        kept = {k: v for k, v in result.filters.items() if k in ("price_min", "price_max", "measures", "terms")}
        return cls(
            mode=result.mode,
            query=_without_words(_without_sort(result.requested), result.filters.get("unmatched") or []),
            categories=list(result.categories[:2]),
            brands=list(result.brands[:3]),
            filters=kept,
            items=[e.display_name for e in rows[:MAX_ITEMS]],
            sort=result.sort,
        )

    @classmethod
    def from_dict(cls, raw: Any) -> Optional["Scope"]:
        if not isinstance(raw, dict) or not raw.get("mode"):
            return None
        return cls(
            mode=str(raw.get("mode") or ""),
            query=str(raw.get("query") or ""),
            categories=[str(c) for c in raw.get("categories") or []],
            brands=[str(b) for b in raw.get("brands") or []],
            filters=dict(raw.get("filters") or {}),
            items=[str(i) for i in raw.get("items") or []],
            sort=raw.get("sort") if raw.get("sort") in _SORT_WORDS else None,
        )

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Anchors:
    """What a message states on its own."""

    categories: List[str]
    brands: List[str]
    names_item: bool
    list_operation: bool
    has_price: bool
    has_measure: bool
    variant_values: List[Tuple[str, ...]] = field(default_factory=list)

    @property
    def empty(self) -> bool:
        return not (self.categories or self.brands or self.names_item)


def _without_sort(text: str) -> str:
    return " ".join(HIGH_RX.sub(" ", LOW_RX.sub(" ", text or "")).split())


def _without_words(text: str, phrases: List[str]) -> str:
    """The question without values no item had ("yellow", "512 GB"), so they do not stick."""
    for phrase in phrases:
        pattern = r"\s*".join(re.escape(w) for w in str(phrase).split())
        text = re.sub(rf"(?<!\w){pattern}(?!\w)", " ", text, flags=re.I)
    return " ".join(text.split())


def anchors(index: CatalogIndex, text: str) -> Anchors:
    q_tokens = tokens(text)
    constraints = extract_constraints(text)
    has_price = constraints.get("price_min") is not None or constraints.get("price_max") is not None
    cats, cat_words = index.category_words(q_tokens, NOISE)
    values = variants.values_in(index.variants, text)
    # "in navy?" names a variant, not an item that happens to carry the colour in its name.
    value_words = {t for v in values for t in v}
    names = bool(identifiers_in(text)) or lookup_item(
        index, text, [t for t in item_tokens(q_tokens, cat_words) if t not in value_words], None, allow_partial=False
    ) is not None
    return Anchors(
        categories=[c for c in cats if not set(tokens(c)) <= NOISE],
        brands=[b for b in index.match_brands(q_tokens) if not set(tokens(b)) <= NOISE],
        names_item=names,
        list_operation=bool(LOW_RX.search(text) or HIGH_RX.search(text) or TOP_N_RX.search(text)
                            or BRANDS_RX.search(text) or has_price or rank_request(text)),
        has_price=has_price,
        has_measure=bool(measures(text)),
        variant_values=values,
    )


def brand_wide(index: CatalogIndex, text: str) -> bool:
    """"Products from Atomberg": a whole-brand listing that inherits no earlier category."""
    a = anchors(index, text)
    return bool(a.brands) and not a.categories and not a.names_item and bool(CATALOG_WIDE_RX.search(text))


def catalog_wide(index: CatalogIndex, text: str, a: Optional[Anchors] = None) -> bool:
    """"List of items below 600", "products under 500": the whole catalog, not the category
    or brand of the previous answer. "Any other products like this?" still points back."""
    if not CATALOG_WIDE_RX.search(text or "") or points_back(text):
        return False
    return (a or anchors(index, text)).empty


def about_listed_items(a: Anchors, text: str) -> bool:
    """Whether a message naming no item is explicitly about the items just shown: it ranks or
    filters them or points back ("is it waterproof?"). "yes", "how many days to return" or
    "which payment methods do you accept" carry no item scope; a bare attribute ("ml?") is
    left to the rewriter, since product pages also carry store-wide words ("delivery")."""
    return bool(a.list_operation or a.has_measure or a.variant_values or points_back(text))


def _leaves_scope(index: CatalogIndex, a: Anchors, text: str, scope: Scope) -> bool:
    """A message naming no item that still moves away from the item shown: it uses words of
    another item's name ("n the stroke of genius one?" after the kajal), or picks "which one"
    when only one item was shown (it compares the items discussed, for the rewriter). Variant
    values ("in yellow?") ask about the item shown, even when another item carries them."""
    if _foreign_name_words(index, a, text, scope):
        return True
    return len(scope.items) <= 1 and asks_selection(text) and not (LOW_RX.search(text) or HIGH_RX.search(text))


def _foreign_name_words(index: CatalogIndex, a: Anchors, text: str, scope: Scope) -> List[str]:
    shown = {t for name in scope.items for t in tokens(name)} | {t for v in a.variant_values for t in v}
    words = [t for t in tokens(text) if t not in NOISE and len(t) > 2]
    return words if any(t in index.df and t not in shown for t in words) else []


def asks_about_shown(index: CatalogIndex, text: str, scope: Scope) -> bool:
    """Right after items were shown, a question naming nothing the catalog knows (no item,
    category, brand, nor another item's name words) asks about them: "how many shades are
    there?" after the serum lipstick. "Corporate gifting?" uses other items' words; "which
    products …" is catalog-wide."""
    if not scope.items or CATALOG_WIDE_RX.search(text or ""):
        return False
    a = anchors(index, text)
    return a.empty and not _foreign_name_words(index, a, text, scope)


def other_items_named(index: CatalogIndex, text: str, scope: Scope) -> List[str]:
    """The item a follow-up names only in part, other than the items shown ("n the stroke
    of genius one?" → the Stroke Of Genius kohl), so the rewriter moves to it: its name
    words not shown are rare enough and only one item (or variant family) has them all."""
    shown = {t for name in scope.items for t in tokens(name)}
    words = {t for t in _foreign_name_words(index, anchors(index, text), text, scope) if t in index.df} - shown
    if not words or sum(index.idf(t) for t in words) < SPECIFIC_MIN_IDF_SHARE * index.max_idf:
        return []
    hits = [e for e in index.entries if words <= set(e.core_tokens)]
    if len({e.variant_group or e.name for e in hits}) != 1:
        return []
    return [] if hits[0].name in scope.items else [hits[0].name]


def _filters_text(filters: Dict[str, Any], *, price: bool, measure: bool, terms: bool = True) -> str:
    bits: List[str] = []
    lo, hi = filters.get("price_min"), filters.get("price_max")
    if price and lo is not None and hi is not None:
        bits.append(f"between {lo:.0f} and {hi:.0f}")
    elif price and hi is not None:
        bits.append(f"under {hi:.0f}")
    elif price and lo is not None:
        bits.append(f"above {lo:.0f}")
    if measure:
        bits.extend(str(m) for m in filters.get("measures") or [])
    if terms:
        bits.extend(str(t) for t in filters.get("terms") or [])
    return " ".join(bits)


def followup_queries(index: CatalogIndex, message: str, scope: Scope, *, is_followup: bool) -> List[Tuple[str, bool]]:
    """Catalog queries to try for ``message`` given the previous scope: ``(query, relax_terms)``."""
    a = anchors(index, message)
    if catalog_wide(index, message, a):
        return []
    # "only acer" / "what about Samsung?" narrows the listed category to a brand;
    # "products from Samsung" lists the whole brand.
    linked = bool(_LINK_RX.search(message) or _DEFINITE_RX.search(message)) or (is_followup and refers_back(message))
    switch = bool(_LINK_RX.search(message) or _SHORT_RX.search(message)) and not a.empty
    brand_only = bool(a.brands) and not a.categories
    if a.names_item or (brand_only and (CATALOG_WIDE_RX.search(message) or not scope.categories or not (is_followup or switch))):
        return []
    if a.empty and (not about_listed_items(a, message) or _leaves_scope(index, a, message, scope)):
        return []
    refine_lead = bool(_REFINE_RX.search(message)) and set(a.categories) <= set(scope.categories)
    refines = a.list_operation or a.has_measure or bool(a.variant_values) or refine_lead or refers_back(message)
    within_brand = (bool(scope.brands) and bool(a.categories) and not a.brands
                    and not set(a.categories) & set(scope.categories) and bool(_DEFINITE_RX.search(message)))
    if not (is_followup or switch or refine_lead or within_brand or (a.empty and refines)):
        return []
    asked = message
    if switch and scope.sort and not a.list_operation:
        asked = f"{_SORT_WORDS[scope.sort]} {message}"
    out: List[Tuple[str, bool]] = []
    if a.empty:
        if a.list_operation:
            item = scope.query if scope.mode == "lookup" else ""
        else:
            item = scope.items[0] if len(scope.items) == 1 else (scope.query if scope.mode == "lookup" else "")
        if item:
            out.append((f"{message} {item}", False))
    # "lipsticks" after "products under 600" narrows a scope that had no category.
    unscoped_list = scope.mode in _LIST_MODES and not scope.categories
    same_scope = not a.categories or unscoped_list or bool(set(a.categories) & set(scope.categories))
    if scope.mode == "lookup" and not a.categories:
        return out
    categories = [] if a.categories else scope.categories[:1]
    brands = scope.brands if scope.mode in _LIST_MODES and not a.brands and (same_scope or linked) else []
    filters = _filters_text(scope.filters, price=not a.has_price, measure=not a.has_measure) if same_scope else ""
    if categories or brands or filters:
        out.append((" ".join([asked, *categories, *brands, filters]).strip(), True))
        if brands:
            out.append((" ".join([asked, *categories, filters]).strip(), True))
    if not a.empty:
        # It states its own scope; a rewrite anchored on the previous topic would be worse.
        out.append((asked, False))
    return list(dict.fromkeys(out))
