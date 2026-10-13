"""In-memory, per-project view of catalog records for fast name / category / brand lookups.

Built from ``catalog_items`` and rebuilt when the project's row count or newest update
changes (checked at most every few seconds). Everything is derived from the data — the
category, brand and name vocabularies come from the records themselves.
"""
from __future__ import annotations

import logging
import math
import re
import threading
import time
from dataclasses import dataclass, field
from typing import AbstractSet, Dict, FrozenSet, List, Optional, Set, Tuple

from . import variants
from .category_match import CategoryMatcher, fold_plural
from .normalize import identifier_key, identifiers_in, norm_name, short_name, similar_token, tokens

logger = logging.getLogger(__name__)
REFRESH_CHECK_SECONDS = 5.0
NAME_STOP = frozenset("a an the and or of for with in on at to by from".split())
# Legal-entity words people leave out when naming a brand ("Penguin Random House India").
LEGAL_SUFFIXES = frozenset(
    "pvt private ltd limited llc llp inc incorporated corp corporation co company plc gmbh ag kg sa sas sarl "
    "srl spa bv nv oy ab as".split()
)


# Review histogram rows captured as highlights ("5 Star", "1 star: 0 (0%)") say nothing about the item.
_RATING_ROW = re.compile(
    r"^\s*\d(?:[.,]\d)?\s*(?:stars?|★|sterne?|étoiles?|estrellas?|estrelas?)\s*"
    r"(?::\s*\d+\s*(?:\(\s*\d+(?:[.,]\d+)?\s*%\s*\))?)?\s*$",
    re.I,
)


def brand_match_tokens(brand: str) -> List[str]:
    toks = tokens(brand)
    core = [t for t in toks if t not in LEGAL_SUFFIXES]
    return core or toks


@dataclass
class Entry:
    document_id: str
    url: str
    name: str
    brand: Optional[str]
    category: Optional[str]
    category_path: List[str]
    price: Optional[float]
    list_price: Optional[float]
    currency: Optional[str]
    availability: Optional[str]
    highlights: List[str]
    fields: Dict[str, str]
    variant_group: Optional[str]
    source_id: str
    display_name: str = ""
    name_key: str = ""
    core_tokens: List[str] = field(default_factory=list)
    name_tokens: Set[str] = field(default_factory=set)
    spec_text: str = ""
    spec_tokens: Set[str] = field(default_factory=set)
    id_keys: Set[str] = field(default_factory=set)


def _core(name: str) -> List[str]:
    head = short_name(name).split("(")[0]
    return [t for t in tokens(head) if t not in NAME_STOP][:12]


def _entry(row) -> Entry:
    attrs = row.attributes or {}
    highlights = [str(x) for x in (attrs.get("highlights") or []) if not _RATING_ROW.match(str(x))][:12]
    fields = {str(k): str(v) for k, v in (attrs.get("fields") or {}).items()}
    e = Entry(
        document_id=str(row.document_id), url=row.url or "", name=row.name, brand=row.brand,
        category=row.category, category_path=list(row.category_path or []), price=row.price,
        list_price=row.list_price, currency=row.currency, availability=row.availability,
        highlights=highlights, fields=fields, variant_group=row.variant_group, source_id=row.source_id,
    )
    e.display_name = short_name(row.name)
    e.name_key = norm_name(e.display_name)
    e.core_tokens = _core(row.name) or tokens(e.display_name)
    e.name_tokens = set(tokens(row.name))
    e.spec_text = " | ".join([row.name, *highlights, *(f"{k}: {v}" for k, v in fields.items())])
    e.spec_tokens = set(tokens(e.spec_text))
    e.id_keys = {identifier_key(c) for c in (row.identifiers or [])} | {
        identifier_key(c) for c in identifiers_in(e.spec_text)
    }
    return e


def token_hit(query_tok: str, candidates: Set[str]) -> bool:
    if query_tok in candidates:
        return True
    if len(query_tok) < 4:
        return False
    return any(similar_token(query_tok, c) for c in candidates if abs(len(c) - len(query_tok)) <= 3)


class CatalogIndex:
    def __init__(self, entries: List[Entry]) -> None:
        self.entries = entries
        self.df: Dict[str, int] = {}
        self.categories: Dict[str, Set[int]] = {}
        self.brands: Dict[str, Set[int]] = {}
        self.ids: Dict[str, Set[int]] = {}
        for i, e in enumerate(entries):
            for tok in e.name_tokens:
                self.df[tok] = self.df.get(tok, 0) + 1
            for label in {*(e.category_path or []), e.category or ""}:
                if label:
                    self.categories.setdefault(label, set()).add(i)
            if e.brand:
                self.brands.setdefault(e.brand, set()).add(i)
            for key in e.id_keys:
                self.ids.setdefault(key, set()).add(i)
        self._brand_tokens = {b: brand_match_tokens(b) for b in self.brands}
        leaf_names: Dict[str, List[Set[str]]] = {}
        for e in entries:
            if e.category:
                leaf_names.setdefault(e.category, []).append(e.name_tokens)
        self._categories = CategoryMatcher(
            {label: len(ix) for label, ix in self.categories.items()},
            leaf_names,
            {t for toks in self._brand_tokens.values() for t in toks},
        )
        self.spec_vocab: Set[str] = set().union(*(e.spec_tokens for e in entries)) if entries else set()
        self.variants = variants.build(entries, NAME_STOP)

    def __len__(self) -> int:
        return len(self.entries)

    @property
    def max_idf(self) -> float:
        return math.log((len(self.entries) + 1) / 1.5)

    def idf(self, tok: str) -> float:
        return math.log((len(self.entries) + 1) / (self.df.get(tok, 0) + 0.5))

    def match_categories(self, q_tokens: List[str], ignore: AbstractSet[str] = frozenset()) -> List[str]:
        """Category labels the query names (see ``category_match``; most specific first)."""
        return self._categories.match(q_tokens, ignore)[0]

    def category_words(self, q_tokens: List[str], ignore: AbstractSet[str] = frozenset()) -> Tuple[List[str], Set[str]]:
        """``(labels, query words that named them)``."""
        return self._categories.match(q_tokens, ignore)

    def knows(self, tok: str) -> bool:
        """Whether any record's name or specs carries the word (or a near spelling)."""
        if tok in self.spec_vocab or any(form in self.spec_vocab for form in fold_plural(tok)):
            return True
        return len(tok) >= 5 and any(
            similar_token(tok, v) for v in self.spec_vocab if v[:2] == tok[:2] and abs(len(v) - len(tok)) <= 2
        )

    def match_brands(self, q_tokens: List[str]) -> List[str]:
        qs = set(q_tokens)
        out = []
        for brand, toks in self._brand_tokens.items():
            if toks and all((t in qs) if len(t) < 5 else token_hit(t, qs) for t in toks):
                out.append(brand)
        return out

    def by_identifier(self, query: str) -> List[Entry]:
        found: List[int] = []
        for code in identifiers_in(query):
            for i in sorted(self.ids.get(identifier_key(code), ())):
                if i not in found:
                    found.append(i)
        return [self.entries[i] for i in found]

    def name_matches(self, q_tokens: List[str], *, limit: int = 8) -> List[Tuple[Entry, float]]:
        """Entries ranked by how much of their core name the query covers (IDF-weighted)."""
        qs = [t for t in q_tokens if t not in NAME_STOP]
        if not qs:
            return []
        vocab_hits = {v for v in self.df if any(similar_token(q, v) for q in qs if abs(len(q) - len(v)) <= 3 or q[:5] == v[:5])}
        if not vocab_hits:
            return []
        scored: List[Tuple[Entry, float]] = []
        for e in self.entries:
            if not vocab_hits.intersection(e.core_tokens):
                continue
            total = sum(self.idf(t) for t in e.core_tokens)
            if total <= 0:
                continue
            hit = sum(self.idf(t) for t in e.core_tokens if t in vocab_hits)
            if hit <= 0:
                continue
            scored.append((e, hit / total))
        scored.sort(key=lambda pair: (-pair[1], len(pair[0].core_tokens), pair[0].price or 0))
        return scored[:limit]

    def in_categories(self, labels: List[str]) -> Set[int]:
        out: Set[int] = set()
        for label in labels:
            out |= self.categories.get(label, set())
        return out

    def of_brands(self, brands: List[str]) -> Set[int]:
        out: Set[int] = set()
        for brand in brands:
            out |= self.brands.get(brand, set())
        return out


class _Cache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: Dict[str, Tuple[tuple, float, CatalogIndex]] = {}

    def get(self, db, project_id: str) -> Optional[CatalogIndex]:
        from .store import project_fingerprint, project_items

        key = str(project_id)
        now = time.monotonic()
        with self._lock:
            cached = self._items.get(key)
        if cached and now - cached[1] < REFRESH_CHECK_SECONDS:
            return cached[2] if len(cached[2]) else None
        fingerprint = project_fingerprint(db, key)
        if cached and cached[0] == fingerprint:
            with self._lock:
                self._items[key] = (fingerprint, now, cached[2])
            return cached[2] if len(cached[2]) else None
        index = CatalogIndex([_entry(row) for row in project_items(db, key)]) if fingerprint and fingerprint[0] else CatalogIndex([])
        with self._lock:
            self._items[key] = (fingerprint, now, index)
        return index if len(index) else None

    def clear(self, project_id: Optional[str] = None) -> None:
        with self._lock:
            if project_id is None:
                self._items.clear()
            else:
                self._items.pop(str(project_id), None)


_CACHE = _Cache()
_views: Dict[str, Tuple[CatalogIndex, FrozenSet[str], CatalogIndex]] = {}
_views_lock = threading.Lock()


def _without_disabled_sources(project_id: str, index: Optional[CatalogIndex]) -> Optional[CatalogIndex]:
    """``index`` without records of sources switched off for answers (memoised per index)."""
    if index is None:
        return None
    from ..rag.source_availability import disabled_source_ids

    disabled = disabled_source_ids(project_id)
    if not disabled:
        return index
    with _views_lock:
        cached = _views.get(project_id)
    if cached is not None and cached[0] is index and cached[1] == disabled:
        view = cached[2]
    else:
        kept = [e for e in index.entries if str(e.source_id).lower() not in disabled]
        view = index if len(kept) == len(index.entries) else CatalogIndex(kept)
        with _views_lock:
            _views[project_id] = (index, disabled, view)
    return view if len(view) else None


def project_index(db, project_id: str) -> Optional[CatalogIndex]:
    """Index of the project's records, or ``None`` when the project has none.

    Reads through a private session on the same engine so a failed read never poisons
    the caller's transaction. Records of sources switched off for answers are left out.
    """
    if not project_id or db is None:
        return None
    from sqlalchemy.orm import Session

    try:
        own = Session(bind=db.get_bind())
    except Exception:
        return None
    try:
        return _without_disabled_sources(str(project_id), _CACHE.get(own, project_id))
    except Exception as exc:
        logger.warning("catalog index unavailable project=%s: %s", project_id, exc)
        return None
    finally:
        own.close()


def invalidate(project_id: Optional[str] = None) -> None:
    _CACHE.clear(project_id)
    with _views_lock:
        if project_id is None:
            _views.clear()
        else:
            _views.pop(str(project_id), None)
