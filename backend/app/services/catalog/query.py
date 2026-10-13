"""Turn a (standalone) question into an exact query over the catalog records.

Deterministic: category, brand and item names are matched against the vocabulary of the
records themselves; price ranges, measures ("8 GB", "1.5 ton") and superlatives come from
multilingual cues. Returns ``None`` when the question is not about items, so the normal
retrieval answer is used unchanged.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..rag.query_signals import extract_constraints
from . import spec_rank, variants
from .compare import compared_items
from .cues import BRANDS_RX, HIGH_RX, LOW_RX, NOISE, PLURAL_RX, TOP_N_RX  # noqa: F401 (re-exported)
from .index import CatalogIndex, Entry, token_hit
from .normalize import has_measure, identifiers_in, measures, memory_pair, similar_token, tokens
from .shaping import in_stock_first, spread_categories, tied_top, unique
from .terms import feature_terms, item_tokens, unknown_model

LIST_LIMIT = 10
LOOKUP_LIMIT = 8
LOOKUP_MIN_SCORE = 0.75
# Missing only low-information name words ("5G") still names the item exactly.
LOOKUP_EXACT_SCORE = 0.85
# A named item that is not in the catalog ("Edge 70 Pro" when only "Edge 70 Fusion" exists)
# still gets its closest items when the shared words are distinctive.
PARTIAL_MIN_SCORE = 0.5
# Words shared with the matched name must be rare in this catalog (share of the rarest
# possible word's IDF), so "smart" or "pro" alone never select an item.
SPECIFIC_MIN_IDF_SHARE = 0.5
# Siblings of the best match (other colours / storage) that carry every named word.
FAMILY_WINDOW = 0.25
CLOSEST_MIN_SCORE = 0.3
# Near-tied names: the one carrying more of the words the user typed wins ("edge 70 fusion"
# is the Fusion, not the Edge 70 Pro whose shorter name scores a hair higher).
TIE_MARGIN = 0.05


@dataclass
class CatalogResult:
    mode: str
    rows: List[Entry]
    total: int
    exact: bool = False
    categories: List[str] = field(default_factory=list)
    brands: List[str] = field(default_factory=list)
    filters: Dict[str, Any] = field(default_factory=dict)
    sort: Optional[str] = None
    single: bool = False
    brand_counts: List[List[Any]] = field(default_factory=list)
    requested: str = ""
    closest: List[Entry] = field(default_factory=list)
    category_counts: List[List[Any]] = field(default_factory=list)
    rank: Optional[spec_rank.Rank] = None

    @property
    def has_rows(self) -> bool:
        return bool(self.rows) or bool(self.brand_counts)

    def document_ids(self, limit: int = 8) -> List[str]:
        ids: List[str] = []
        for e in [*self.rows, *self.closest]:
            if e.document_id not in ids:
                ids.append(e.document_id)
        return ids[:limit]

    def to_meta(self) -> Dict[str, Any]:
        return {
            "mode": self.mode, "total": self.total, "exact": self.exact, "single": self.single,
            "categories": self.categories[:3], "brands": self.brands[:5], "filters": self.filters,
            "sort": self.sort, "ranked_by": self.rank.label() if self.rank else None,
            "rows": [e.display_name for e in self.rows[:LIST_LIMIT]],
            "closest": [e.display_name for e in self.closest[:3]],
        }


def _price_key(e: Entry, reverse: bool):
    if e.price is None:
        return (1, 0.0)
    return (0, -e.price if reverse else e.price)


def _wanted_count(query: str, superlative: bool) -> Optional[int]:
    m = TOP_N_RX.search(query)
    if m:
        return max(1, min(int(m.group(1) or m.group(2)), LIST_LIMIT))
    if superlative and not PLURAL_RX.search(query):
        return 1
    return None


def _compared(index: CatalogIndex, query: str) -> Optional[CatalogResult]:
    found = compared_items(index, query, lambda ix, text, toks, sup: lookup_item(ix, text, toks, sup, allow_partial=True))
    if found is None:
        return None
    rows, missing, exact = found
    filters: Dict[str, Any] = {"compared": True}
    if missing:
        filters["unmatched_items"] = missing
    return CatalogResult("lookup", rows, len(rows), exact=exact, filters=filters, requested=query)


def _ranked_top(rows: List[Entry], rank: spec_rank.Rank) -> List[Entry]:
    top = rank.values.get(rows[0].document_id) if rows else None
    if top is None:
        return rows[:1]
    return [e for e in rows if rank.values.get(e.document_id) == top][:3]


def _best_match(index: CatalogIndex, matches: List, q_tokens: List[str], floor: float):
    def said(e: Entry) -> float:
        return sum(index.idf(t) for t in e.core_tokens if any(similar_token(q, t) for q in q_tokens))

    lowest = max(matches[0][1] - TIE_MARGIN, floor)
    return max((m for m in matches if m[1] >= lowest), key=lambda m: (said(m[0]), m[1]))


def lookup_item(
    index: CatalogIndex, query: str, q_tokens: List[str], superlative: Optional[str], *, allow_partial: bool
) -> Optional[CatalogResult]:
    """Rows of the item the question names (with its variants), or ``None``."""
    by_id = index.by_identifier(query)
    if by_id:
        rows = unique(by_id)
        return CatalogResult("lookup", rows[:LOOKUP_LIMIT], len(rows), exact=True, requested=query)
    matches = index.name_matches(q_tokens, limit=60)
    floor = PARTIAL_MIN_SCORE if allow_partial else LOOKUP_MIN_SCORE
    if not matches or matches[0][1] < floor:
        return None
    best, score = _best_match(index, matches, q_tokens, floor)
    generic = set(tokens(best.brand or "")) | {t for label in best.category_path + [best.category or ""] for t in tokens(label)}
    specific = [
        t for t in best.core_tokens
        if not token_hit(t, generic) and any(similar_token(q, t) for q in q_tokens)
    ]
    brand_named = bool(best.brand) and all(any(similar_token(q, t) for q in q_tokens) for t in tokens(best.brand))
    rare_enough = bool(specific) and sum(index.idf(t) for t in specific) >= SPECIFIC_MIN_IDF_SHARE * index.max_idf
    if not rare_enough and not (brand_named and specific and score >= LOOKUP_MIN_SCORE):
        return None
    named = {t for t in best.core_tokens if any(similar_token(q, t) for q in q_tokens)}
    rows = [
        e for e, s in matches
        if (s >= score - FAMILY_WINDOW and named <= set(e.core_tokens))
        or (best.variant_group and e.variant_group == best.variant_group)
    ]
    wanted = measures(query)
    narrowed = [e for e in rows if all(has_measure(e.spec_text, m) for m in wanted)] if wanted else rows
    filters: Dict[str, Any] = {}
    if wanted and not narrowed:
        filters["unmatched"] = [m.text for m in wanted]
    rows = narrowed or rows
    own_words = set(best.core_tokens) | set(tokens(best.brand or ""))
    values = variants.values_in(index.variants, query, ignore=own_words)
    closest: List[Entry] = []
    if values:
        matched = variants.narrow(index.variants, rows, values)
        if not matched:
            filters["unmatched"] = [*filters.get("unmatched", []), *variants.labels(values)]
            closest = variants.alternatives(index.variants, index.entries, values, best)
            if closest:
                filters["alternatives_for"] = variants.labels(values)
        rows = matched or rows
    if superlative:
        rows.sort(key=lambda e: _price_key(e, superlative == "high"))
    rows = unique(rows)
    return CatalogResult(
        "lookup", rows[:LOOKUP_LIMIT], len(rows), exact=score >= LOOKUP_EXACT_SCORE, filters=filters,
        requested=query, closest=closest,
    )


def _brand_listing(result: CatalogResult, rows: List[Entry]) -> CatalogResult:
    counts: Dict[str, int] = {}
    firsts: Dict[str, Entry] = {}
    for e in unique(sorted(rows, key=lambda e: _price_key(e, False))):
        if e.brand:
            counts[e.brand] = counts.get(e.brand, 0) + 1
            firsts.setdefault(e.brand, e)
    result.mode = "brands"
    result.total = sum(counts.values())
    result.brand_counts = [[b, n] for b, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))]
    result.rows = [firsts[b] for b, _ in result.brand_counts][:LIST_LIMIT]
    return result


def run(index: Optional[CatalogIndex], query: str, *, relax_terms: bool = False) -> Optional[CatalogResult]:
    """Exact answer rows for ``query`` or ``None`` when it is not an item question.

    ``relax_terms``: words no item in scope carries are ignored instead of ending the
    query (a follow-up such as "which has the biggest battery?" within a known scope).
    """
    if index is None or not (query or "").strip():
        return None
    q_tokens = tokens(query)
    rank = spec_rank.rank_request(query)
    sort_text = query[: rank.span[0]] + " " + query[rank.span[1]:] if rank else query
    superlative = "low" if LOW_RX.search(sort_text) else ("high" if HIGH_RX.search(sort_text) else None)
    want_brands = bool(BRANDS_RX.search(query))
    cats, cat_words = index.category_words(q_tokens, ignore=NOISE)
    cats = [c for c in cats if not set(tokens(c)) <= NOISE]
    brands = [b for b in index.match_brands(q_tokens) if not set(tokens(b)) <= NOISE]

    constraints = extract_constraints(query)
    wanted = [*measures(query), *memory_pair(query)]
    price_min, price_max = constraints.get("price_min"), constraints.get("price_max")
    if not want_brands:
        compared = _compared(index, query)
        if compared is not None:
            compared.categories, compared.brands = cats, brands
            return compared
        allow_partial = not superlative and not rank and price_min is None and price_max is None
        hit = lookup_item(index, query, item_tokens(q_tokens, cat_words), superlative, allow_partial=allow_partial)
        if hit is not None:
            hit.categories, hit.brands, hit.sort = cats, brands, superlative
            if superlative and _wanted_count(query, True) == 1:
                hit.rows, hit.single = tied_top(hit.rows), True
            return hit
        if identifiers_in(query) and not memory_pair(query):
            near = unique([e for e, s in index.name_matches(q_tokens, limit=6) if s >= CLOSEST_MIN_SCORE])[:3]
            return CatalogResult("missing", [], 0, categories=cats, brands=brands, requested=query, closest=near)
    if not (cats or brands or price_min is not None or price_max is not None):
        return None

    pool = set(range(len(index.entries)))
    if cats:
        pool &= index.in_categories(cats)
    if brands:
        pool &= index.of_brands(brands)
    rows = [index.entries[i] for i in sorted(pool)]
    feature_text = sort_text if rank else query
    operation = bool(superlative or rank or price_min is not None or price_max is not None)
    terms, ignored = feature_terms(feature_text, index, cat_words, cats, brands, operation=operation)
    if terms:
        scoped = rows
        rows = [e for e in rows if all(token_hit(t, e.spec_tokens) for t in terms)]
        if not rows and relax_terms:
            rows, terms = scoped, []
        lacks_model = not rows or (not operation and unknown_model(query, terms, rows, brands=brands, cats=cats))
        if lacks_model and brands and not want_brands:
            # A brand plus words no item of that brand is named by: a model the catalog lacks.
            near = unique([e for e, s in index.name_matches(q_tokens, limit=6) if s >= CLOSEST_MIN_SCORE])[:3]
            return CatalogResult(
                "missing", [], 0, categories=cats, brands=brands, requested=query, closest=near,
                filters={} if rows else {"unknown_terms": terms},
            )
        if not rows:
            return None
    if price_min is not None or price_max is not None:
        rows = [
            e for e in rows if e.price is not None
            and (price_min is None or e.price >= price_min) and (price_max is None or e.price <= price_max)
        ]
    closest: List[Entry] = []
    if wanted:
        matched = [e for e in rows if all(has_measure(e.spec_text, m) for m in wanted)]
        if not matched:
            closest = sorted(rows, key=lambda e: -sum(has_measure(e.spec_text, m) for m in wanted))[:3]
        rows = matched

    filters: Dict[str, Any] = {k: v for k, v in (("price_min", price_min), ("price_max", price_max)) if v is not None}
    if wanted:
        filters["measures"] = [m.text for m in wanted]
    if terms:
        filters["terms"] = terms
    if ignored:
        filters["ignored"] = ignored
    result = CatalogResult(
        "list", [], len(rows), categories=cats, brands=brands, filters=filters,
        sort=superlative, requested=query, closest=closest,
    )
    if want_brands and not brands:
        return _brand_listing(result, rows)
    rows = unique(sorted(rows, key=lambda e: _price_key(e, superlative == "high")))
    if rank is not None:
        ranked = spec_rank.apply(rank, rows)
        if rank.values:
            rows, result.rank, result.sort = ranked, rank, None
    result.total = len(rows)
    count = _wanted_count(query, bool(superlative or result.rank))
    result.single = count == 1
    ordered = superlative or result.rank
    # "Products under 600" across many categories: a few of each beats the ten cheapest.
    broad = not cats and not ordered and count is None and result.total > LIST_LIMIT
    if result.single:
        result.rows = _ranked_top(rows, result.rank) if result.rank else tied_top(rows)
    elif (brands and not cats and not superlative and not filters) or broad:
        result.rows, result.category_counts = spread_categories(in_stock_first(rows), LIST_LIMIT)
    else:
        result.rows = (rows if ordered else in_stock_first(rows))[: count or LIST_LIMIT]
    return result
