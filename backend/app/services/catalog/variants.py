"""Variant values of catalog items ("navy", "pantone blue surf", "frost free"), derived from the records.

A record field is a variant dimension when its value changes between members of one item
family and the members' names carry it ("(Navy, 128 GB)" with Color: Navy); a seller field
changes too but never shows in the names. Words in the bracketed name part that differ
between family members count as well, so sources without structured fields work too.
Measures stay with ``normalize.measures``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import AbstractSet, Dict, FrozenSet, Iterable, List, Optional, Set, Tuple

from .normalize import MEASURE_RE, short_name, tokens

Value = Tuple[str, ...]
ALTERNATIVES_LIMIT = 3
# A field must vary (with its value in the names) in this many families to be a dimension.
MIN_DIMENSION_FAMILIES = 2
MIN_HEAD_VALUES = 2
_MIN_WORD = 3
_BRACKETS = re.compile(r"\(([^)]*)\)")
_PARTS = re.compile(r"[,/;]")


@dataclass(frozen=True)
class VariantVocab:
    keys: FrozenSet[str]
    values: FrozenSet[Value]
    longest: int = 0

    def row_tokens(self, e) -> Set[str]:
        out = set(e.name_tokens)
        for key in self.keys:
            if e.fields.get(key):
                out.update(tokens(e.fields[key]))
        return out


def _value(text: str, stop: AbstractSet[str]) -> Value:
    words = tuple(t for t in tokens(MEASURE_RE.sub(" ", text or "")) if t.isalpha())
    if not words or all(t in stop or len(t) < _MIN_WORD for t in words):
        return ()
    return words


def _families(entries: Iterable) -> List[List]:
    groups: Dict[str, List] = {}
    for e in entries:
        if e.variant_group:
            groups.setdefault(e.variant_group, []).append(e)
    return [g for g in groups.values() if len({e.name_key for e in g}) > 1]


def _dimension_keys(families: List[List], stop: AbstractSet[str]) -> Set[str]:
    hits: Dict[str, int] = {}
    for family in families:
        for key in {k for e in family for k in e.fields}:
            present = [(e, v) for e in family if (v := _value(e.fields.get(key, ""), stop))]
            if len({v for _, v in present}) > 1 and all(set(v) <= e.name_tokens for e, v in present):
                hits[key] = hits.get(key, 0) + 1
    return {k for k, n in hits.items() if n >= MIN_DIMENSION_FAMILIES}


def _bracket_values(e, stop: AbstractSet[str]) -> Set[Value]:
    """Comma-separated parts of the bracketed name text ("(Cosmic Blue, 128 GB)")."""
    parts = (p for group in _BRACKETS.findall(short_name(e.name)) for p in _PARTS.split(group))
    return {v for p in parts if (v := _value(p, stop))}


def build(entries: List, stop: AbstractSet[str] = frozenset()) -> VariantVocab:
    families = _families(entries)
    keys = _dimension_keys(families, stop)
    values: Set[Value] = set()
    for e in entries:
        for key in keys:
            v = _value(e.fields.get(key, ""), stop)
            if v and set(v) <= e.name_tokens:
                values.add(v)
    for family in families:
        parts = [_bracket_values(e, stop) for e in family]
        common = set.intersection(*parts) if parts else set()
        values.update(v for ps in parts for v in ps - common)
    # "red" alone when only "Berry Red" and "Flame Red" are listed: a word that ends several values.
    heads: Dict[str, int] = {}
    for v in values:
        if len(v) > 1:
            heads[v[-1]] = heads.get(v[-1], 0) + 1
    values.update((w,) for w, n in heads.items() if n >= MIN_HEAD_VALUES and w not in stop)
    return VariantVocab(frozenset(keys), frozenset(values), max((len(v) for v in values), default=0))


def values_in(vocab: Optional[VariantVocab], text: str, *, ignore: AbstractSet[str] = frozenset()) -> List[Value]:
    """Variant values the text names, longest first ("light blue" before "blue")."""
    if vocab is None or not vocab.values:
        return []
    toks = tokens(text)
    out: List[Value] = []
    i = 0
    while i < len(toks):
        for n in range(min(vocab.longest, len(toks) - i), 0, -1):
            phrase = tuple(toks[i:i + n])
            if phrase in vocab.values and not set(phrase) <= ignore:
                out.append(phrase)
                i += n
                break
        else:
            i += 1
    return list(dict.fromkeys(out))


def has_values(vocab: VariantVocab, e, values: List[Value]) -> bool:
    have = vocab.row_tokens(e)
    return all(set(v) <= have for v in values)


def narrow(vocab: VariantVocab, rows: List, values: List[Value]) -> List:
    return [e for e in rows if has_values(vocab, e, values)]


def _labels_of(e) -> Set[str]:
    return {label for label in [*(e.category_path or []), e.category or ""] if label}


def alternatives(vocab: VariantVocab, entries: List, values: List[Value], like, *, limit: int = ALTERNATIVES_LIMIT) -> List:
    """Other items that have the values, from the named item's category or its parents
    (a yellow tablet for a phone, never yellow shoes); closest category first, then cheapest."""
    own = _labels_of(like)
    found = [
        (len(own & _labels_of(e)), e) for e in entries
        if e.variant_group != like.variant_group and has_values(vocab, e, values)
    ]
    found = [(shared, e) for shared, e in found if shared or not own]
    found.sort(key=lambda pair: (-pair[0], pair[1].price is None, pair[1].price or 0.0))
    out: List = []
    for _, e in found:
        if all(e.name_key != o.name_key for o in out):
            out.append(e)
        if len(out) >= limit:
            break
    return out


def labels(values: List[Value]) -> List[str]:
    return [" ".join(v) for v in values]
