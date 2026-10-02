"""Language-aware keyword handling for keyword (full-text and scan) retrieval.

* Stop words follow the question's language, so German filler ("wir", "sind", "eine")
  never takes the place of the real search terms.
* Codes stay one token: article numbers such as ``10.00.00.36`` or ``1.4301`` keep
  their dots, matching how Postgres' ``simple`` parser indexes them.
* When a question has more terms than the cap, the most informative ones (codes, long
  words) are kept instead of the first ones.
* ``match_form`` is a light suffix strip; the result is always a prefix of the word, so
  prefix/substring matching with it finds every inflection the word itself would match.
* Compound languages (German, Dutch, Nordic): passages also index the trailing parts
  of long words, so the query word "verschleppen" meets "Wasserverschleppung" and
  "Reinigung" meets "Sohlenreinigung". Query words are never split: arbitrary splits
  of a query word ("nsbereich", "nummer") match thousands of passages and add noise.
"""
from __future__ import annotations

import re
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

from .query_language import detect_text_language, normalize_lang_code
from .stopwords import stopwords_for

MAX_KEYWORDS = 10
MIN_WORD_CHARS = 3
MIN_CODE_CHARS = 2
COMPOUND_LANGS = frozenset({"de", "nl", "sv", "da", "no", "nb", "fi"})
COMPOUND_MIN_CHARS = 10
COMPOUND_PART_MIN_CHARS = 5
COMPOUND_HEAD_SKIP = 3
_MIN_STEM_CHARS = 4

_TOKEN_RE = re.compile(r"[^\W_]+(?:[./][^\W_]+)*", re.UNICODE)
_DIGIT_RE = re.compile(r"\d")
_ALPHA_RE = re.compile(r"^[^\W\d_]+$", re.UNICODE)

# Longest suffix first; only inflection/derivation endings, never part of a word stem.
_SUFFIXES: Dict[str, Tuple[str, ...]] = {
    "de": ("ungen", "heiten", "keiten", "ung", "heit", "keit", "ern", "em", "en", "er", "es", "e", "n", "s"),
    "nl": ("heden", "ingen", "heid", "ing", "en", "er", "e", "s"),
    "en": ("ations", "ation", "ings", "ing", "ies", "ied", "es", "ed", "s"),
    "fr": ("ements", "ement", "ations", "ation", "euses", "euse", "eurs", "eur", "ées", "és", "ée", "es", "er", "é", "e", "s", "x"),
    "es": ("aciones", "ación", "amientos", "amiento", "idades", "idad", "mente", "es", "as", "os", "a", "o", "s"),
    "pt": ("ações", "ação", "idades", "idade", "mente", "os", "as", "es", "a", "o", "s"),
    "it": ("azioni", "azione", "mente", "ità", "i", "e", "a", "o"),
}


def keyword_language(query: Optional[str], fallback: Optional[str] = None) -> Optional[str]:
    """Language of the question text, else the caller's language hint."""
    return detect_text_language(query) or normalize_lang_code(fallback)


def _tokens(text: str) -> Iterable[str]:
    """Words and codes; dotted parts stay joined only when they carry a digit."""
    for raw in _TOKEN_RE.findall(text.lower()):
        if _DIGIT_RE.search(raw):
            yield raw
        else:
            yield from (part for part in re.split(r"[./]", raw) if part)


def _informative_rank(token: str) -> int:
    if _DIGIT_RE.search(token):
        return 0
    if len(token) >= 8:
        return 1
    return 2 if len(token) >= 5 else 3


def extract_keywords(query: Optional[str], lang: Optional[str] = None, limit: int = MAX_KEYWORDS) -> List[str]:
    """Distinct non-stop-word terms of ``query`` in question order (at most ``limit``)."""
    stop = stopwords_for(keyword_language(query, lang))
    seen: set = set()
    picked: List[str] = []
    for token in _tokens(query or ""):
        min_chars = MIN_CODE_CHARS if _DIGIT_RE.search(token) else MIN_WORD_CHARS
        if token in seen or token in stop or len(token) < min_chars:
            continue
        seen.add(token)
        picked.append(token)
    if len(picked) <= limit:
        return picked
    keep = sorted(range(len(picked)), key=lambda i: (_informative_rank(picked[i]), i))[:limit]
    return [picked[i] for i in sorted(keep)]


def match_form(token: str, lang: Optional[str]) -> str:
    """Light stem of ``token`` (a prefix of it); codes and short words are unchanged."""
    suffixes = _SUFFIXES.get(lang or "")
    if not suffixes or not _ALPHA_RE.match(token) or len(token) <= _MIN_STEM_CHARS:
        return token
    for suffix in suffixes:
        if token.endswith(suffix) and len(token) - len(suffix) >= _MIN_STEM_CHARS:
            return token[: -len(suffix)]
    return token


def match_forms(keywords: Sequence[str], lang: Optional[str]) -> List[str]:
    """Distinct light stems for substring/prefix matching, in keyword order."""
    out: List[str] = []
    for kw in keywords:
        form = match_form(kw, lang)
        if form not in out:
            out.append(form)
    return out


def is_compound_language(lang: Optional[str]) -> bool:
    return (lang or "") in COMPOUND_LANGS


def compound_tails(word: str) -> List[str]:
    """Trailing parts of a long word ("wasserverschleppung" → …, "verschleppung", …)."""
    if len(word) < COMPOUND_MIN_CHARS or not _ALPHA_RE.match(word):
        return []
    last = len(word) - COMPOUND_PART_MIN_CHARS
    return [word[i:] for i in range(COMPOUND_HEAD_SKIP, last + 1)]


def tsquery_text(keywords: Sequence[str], lang: Optional[str]) -> str:
    """OR query of light stems for ``to_tsquery('simple', …)``; prefix match from 4 chars."""
    terms: List[str] = []
    for kw in keywords:
        for token in _tokens(kw or ""):
            if len(token) < MIN_CODE_CHARS:
                continue
            form = match_form(token, lang)
            term = f"{form}:*" if len(form) >= _MIN_STEM_CHARS else form
            if term not in terms:
                terms.append(term)
    return " | ".join(terms)


def index_fragments(text: str, lang: Optional[str], max_chars: int = 20000) -> str:
    """Compound tails of a passage's long words, space-joined for the full-text index."""
    if not is_compound_language(lang) or not text:
        return ""
    parts: List[str] = []
    seen: set = set()
    size = 0
    for word in dict.fromkeys(_TOKEN_RE.findall(text.lower())):
        for tail in compound_tails(word):
            if tail in seen:
                continue
            seen.add(tail)
            size += len(tail) + 1
            if size > max_chars:
                return " ".join(parts)
            parts.append(tail)
    return " ".join(parts)
