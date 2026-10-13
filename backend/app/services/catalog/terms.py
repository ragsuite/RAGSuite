"""Which question words filter items, which name a model, and which are filler."""
from __future__ import annotations

import re
from typing import List, Sequence, Set, Tuple

from .category_match import fold_plural
from .cues import NOISE
from .index import NAME_STOP, CatalogIndex, Entry, token_hit
from .normalize import MEASURE_RE, tokens

# "20k", "1.5l", "2lakh": amounts the price constraint already carries.
_AMOUNT_TOKEN = re.compile(r"\d+(?:[.,]\d+)?(?:(?:k|l|lakhs?|lacs?|cr)(?:rs|inr)?|rs|inr|usd|eur|gbp)")
# "PlayStation 9": a model number written after a name word.
_MODEL_NUMBER_RX = re.compile(r"([^\W\d_]+)\s+(\d+)(?![\d.,])")


def item_tokens(q_tokens: List[str], cat_words: Set[str]) -> List[str]:
    """Query words for item-name lookup: a category named in the plural is not a model name
    ("8/128 phones" is not the "Nothing Phone"); a singular one may be ("Panasonic 20 L Grill")."""
    kept = [t for t in q_tokens if not (t in cat_words and len(fold_plural(t)) > 1)]
    return kept if kept else q_tokens


def unknown_model(query: str, terms: List[str], rows: Sequence[Entry], *, brands: List[str], cats: List[str]) -> bool:
    """"Sony PlayStation 9" with no category: a brand plus a name-like word (and the model
    number written after it) that no matching item carries in its name asks for a model the
    catalog lacks."""
    if not brands or cats:
        return False
    named = [t for t in terms if t in named_words(query)]
    if not named:
        return False
    numbers = [n for w, n in _MODEL_NUMBER_RX.findall(MEASURE_RE.sub(" ", query)) if w.lower() in named]
    return not any(
        all(token_hit(t, e.name_tokens) for t in named) and all(n in e.name_tokens for n in numbers) for e in rows
    )


def named_words(query: str) -> Set[str]:
    """Words written like names: capitalised (unless the whole text is), or mixing letters and digits."""
    words = re.findall(r"[^\W_]+", query or "")
    shouting = (query or "").isupper()
    return {
        w.lower() for w in words
        if (w[:1].isupper() and not shouting) or (any(c.isdigit() for c in w) and any(c.isalpha() for c in w))
    }


def feature_terms(
    query: str, index: CatalogIndex, cat_words: Set[str], cats: List[str], brands: List[str], *, operation: bool
) -> Tuple[List[str], List[str]]:
    """``(terms every row must carry, words ignored)``.

    With a list operation (superlative, price range, spec ranking), a plain word no record
    carries at all ("plz", "konsa") is chat filler and is ignored; a name-like word
    ("Zentrix", "Q9") never is.
    """
    stripped = MEASURE_RE.sub(" ", re.sub(r"(\d+(?:[.,]\d+)?\s?\w+)\s+\w+", lambda m: m.group(1) if MEASURE_RE.match(m.group(1)) else m.group(0), query))
    used: Set[str] = set(cat_words)
    for label in cats:
        used |= set(tokens(label))
    for brand in brands:
        used |= set(tokens(brand))
    named = named_words(query)
    out: List[str] = []
    ignored: List[str] = []
    for tok in tokens(stripped):
        if tok in NOISE or tok in NAME_STOP or tok.isdigit() or len(tok) < 3 or _AMOUNT_TOKEN.fullmatch(tok):
            continue
        if tok in used or token_hit(tok, used):
            continue
        if operation and tok not in named and not index.knows(tok):
            ignored.append(tok)
            continue
        out.append(tok)
    return out, ignored
