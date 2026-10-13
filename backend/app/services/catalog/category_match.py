"""Which categories a question names.

Tiers, first non-empty wins:

1. every word of a category label ("washing machines" → Washing Machines);
2. the same after folding short plurals and everyday retail synonyms ("TVs", "phones");
3. the label's head noun, its last word ("mixer grinders" → Mixer Juicer Grinder);
4. words that mark one category's item names in this catalog ("AC" → Air Conditioners,
   when nearly every air-conditioner name says "AC" and almost nothing else does).

Tiers 1, 3 and 4 come from the records themselves; the synonym table only maps everyday
words to the canonical word and applies only when this catalog has a category using it.
"""
from __future__ import annotations

from typing import AbstractSet, Dict, List, Sequence, Set, Tuple

from .normalize import UNITS, similar_token, tokens

# Everyday word → the word a category label would use (any retail catalog).
SYNONYMS: Dict[str, str] = {
    "phone": "mobile", "smartphone": "mobile", "cellphone": "mobile", "handset": "mobile",
    "tv": "television", "telly": "television", "fridge": "refrigerator",
    "notebook": "laptop", "earbuds": "true wireless", "earbud": "true wireless",
    "sneakers": "shoes", "tshirt": "t shirt",
}
# A marker word appears in at least this share of the category's item names …
SIGNATURE_MIN_SHARE = 0.8
# … and at least this share of the item names carrying it belong to the category.
SIGNATURE_MIN_PRECISION = 0.85
SIGNATURE_MIN_ITEMS = 3
_SKIP = frozenset("a an the and or of for with in on at to by from".split())
# "GB" in every phone name states a measure ("with 8 GB RAM"), not the category.
_UNITS = frozenset(UNITS)

Hits = List[Tuple[str, Set[str]]]


def fold_plural(tok: str) -> List[str]:
    """``tvs`` → ``tv``, ``batteries`` → ``battery``; the word itself first."""
    out = [tok]
    if len(tok) > 4 and tok.endswith("ies"):
        out.append(tok[:-3] + "y")
    if len(tok) > 3 and tok.endswith("es"):
        out.append(tok[:-2])
    if len(tok) > 2 and tok.endswith("s") and not tok.endswith("ss"):
        out.append(tok[:-1])
    return out


def _hit(word: str, query: Set[str]) -> bool:
    if word in query:
        return True
    if len(word) < 4:
        return False
    return any(similar_token(word, q) for q in query if abs(len(q) - len(word)) <= 3)


def marker_words(leaf_names: Dict[str, List[Set[str]]], brand_words: Set[str]) -> Dict[str, Set[str]]:
    """Name word → categories it marks (tier 4)."""
    df: Dict[str, int] = {}
    for names in leaf_names.values():
        for name in names:
            for tok in name:
                df[tok] = df.get(tok, 0) + 1
    out: Dict[str, Set[str]] = {}
    for label, names in leaf_names.items():
        if len(names) < SIGNATURE_MIN_ITEMS:
            continue
        counts: Dict[str, int] = {}
        for name in names:
            for tok in name:
                counts[tok] = counts.get(tok, 0) + 1
        for tok, n in counts.items():
            if (
                len(tok) < 2 or tok in _SKIP or tok in _UNITS or tok in brand_words or any(c.isdigit() for c in tok)
                or n < SIGNATURE_MIN_SHARE * len(names) or n < SIGNATURE_MIN_PRECISION * df[tok]
            ):
                continue
            out.setdefault(tok, set()).add(label)
    return out


class CategoryMatcher:
    def __init__(self, label_sizes: Dict[str, int], leaf_names: Dict[str, List[Set[str]]], brand_words: Set[str]) -> None:
        labels = {label: [t for t in tokens(label) if t not in _SKIP] for label in label_sizes}
        self._labels = {label: toks for label, toks in labels.items() if toks}
        self._sizes = label_sizes
        self._markers = marker_words(leaf_names, brand_words)
        vocab = {t for toks in self._labels.values() for t in toks}
        self._synonyms = {
            word: tokens(target) for word, target in SYNONYMS.items()
            if all(_hit(t, vocab) for t in tokens(target))
        }

    def label_words(self, label: str) -> List[str]:
        return self._labels.get(label, [])

    def _full(self, forms: Dict[str, str]) -> Hits:
        """Labels whose words all appear; exact spellings win over near ones ("tables" ≠ "tablets")."""
        query = set(forms)
        folded = {f for q in query for f in fold_plural(q)}
        exact = []
        for label, toks in self._labels.items():
            label_forms = {f for t in toks for f in fold_plural(t)}
            if all(set(fold_plural(t)) & folded for t in toks):
                exact.append((label, {forms[q] for q in query if set(fold_plural(q)) & label_forms}))
        if exact:
            return exact
        return [
            (label, {forms[q] for q in query if any(_hit(t, {q}) for t in toks)})
            for label, toks in self._labels.items() if all(_hit(t, query) for t in toks)
        ]

    def _heads(self, forms: Dict[str, str]) -> Hits:
        return [
            (label, {forms[q] for q in forms if _hit(toks[-1], {q})})
            for label, toks in self._labels.items() if _hit(toks[-1], set(forms))
        ]

    def _marked(self, forms: Dict[str, str]) -> Hits:
        return [(label, {forms[form]}) for form in forms for label in sorted(self._markers.get(form, ()))]

    def _expanded(self, q_tokens: Sequence[str], ignore: AbstractSet[str]) -> Dict[str, str]:
        """Query word forms → the query word they came from (``ignore`` words never count)."""
        out: Dict[str, str] = {}
        for tok in q_tokens:
            if tok in ignore:
                continue
            for form in fold_plural(tok):
                out.setdefault(form, tok)
                for syn in self._synonyms.get(form, ()):
                    out.setdefault(syn, tok)
        return out

    def match(self, q_tokens: Sequence[str], ignore: AbstractSet[str] = frozenset()) -> Tuple[List[str], Set[str]]:
        """``(labels, query words that named them)``; most specific, then largest, first.

        ``ignore``: filler words that only count when a label spells them out in full."""
        hits = self._full({t: t for t in q_tokens})
        forms = self._expanded(q_tokens, ignore)
        hits = hits or self._full(forms)
        subtypes: List[str] = []
        if hits:
            best = max(len(self._labels[label]) for label, _ in hits)
            hits = [(label, used) for label, used in hits if len(self._labels[label]) == best]
            subtypes = self._subtypes([label for label, _ in hits])
        else:
            hits = self._heads(forms) or self._marked(forms)
        if not hits:
            return [], set()
        merged: Dict[str, Set[str]] = {}
        for label, used in hits:
            merged.setdefault(label, set()).update(used)
        labels = sorted(merged, key=lambda label: (-len(self._labels[label]), -self._sizes.get(label, 0)))
        return labels + [s for s in subtypes if s not in merged], set().union(*merged.values())

    def _subtypes(self, named: List[str]) -> List[str]:
        """Narrower labels of the named ones: same head noun plus qualifiers ("Foundation" →
        "Liquid Foundation"), largest first. "Foundation Brush" is a brush, not a foundation."""
        out = []
        for label, toks in self._labels.items():
            if label in named:
                continue
            if any(
                len(toks) > len(self._labels[n]) and toks[-1] == self._labels[n][-1] and set(self._labels[n]) <= set(toks)
                for n in named
            ):
                out.append(label)
        return sorted(out, key=lambda label: -self._sizes.get(label, 0))
