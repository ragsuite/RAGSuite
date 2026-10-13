"""Language-aware keyword handling for keyword (full-text and scan) retrieval.

* Stop words follow the question's language, so German filler ("wir", "sind", "eine")
  never takes the place of the real search terms.
* Codes stay one token: article numbers such as ``10.00.00.36`` or ``1.4301`` keep
  their dots and model codes such as ``EK-H1`` their hyphen, matching how Postgres'
  ``simple`` parser indexes them.
* When a question has more terms than the cap, the most informative ones (codes, long
  words) are kept instead of the first ones.
* ``match_form`` is a light suffix strip; the result is always a prefix of the word, so
  prefix/substring matching with it finds every inflection the word itself would match.
* Compound languages (German, Dutch, Nordic): passages also index the trailing parts
  of long words, so the query word "verschleppen" meets "Wasserverschleppung" and
  "Reinigung" meets "Sohlenreinigung". Query words are never split: arbitrary splits
  of a query word ("nsbereich", "nummer") match thousands of passages and add noise.
* Hyphenated codes are also indexed joined ("HKV-HBW-A-ST" → "hkvhbwast"), so a code
  typed without hyphens ("HKVHBW") prefix-matches it.
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
# Query side only: hyphens also join code parts ("EK-H1", "MKH-1K"); Postgres' ``simple``
# parser indexes such a word whole as well as in parts.
_QUERY_TOKEN_RE = re.compile(r"[^\W_]+(?:[./-][^\W_]+)*", re.UNICODE)
_CAPS_WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)
_HYPHENATED_RE = re.compile(r"[^\W_]+(?:-[^\W_]+)+", re.UNICODE)
_JOINED_MAX_CHARS = 40
_DIGIT_RE = re.compile(r"\d")
_ALPHA_RE = re.compile(r"^[^\W\d_]+$", re.UNICODE)
_LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)
_CODE_MIN_CHARS = 4
_INFORMATIVE_MIN_CHARS = 8
_BARE_NUMBER_RE = re.compile(r"^\d{1,4}$")

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
    """Words and codes; dotted/hyphenated parts stay joined only when they carry a digit."""
    for raw in _QUERY_TOKEN_RE.findall(text.lower()):
        if _DIGIT_RE.search(raw):
            yield raw
        else:
            yield from (part for part in re.split(r"[./-]", raw) if part)


def is_code(token: str) -> bool:
    """Article/model identifier: digits plus letters or separators ("ek-h1", "10.00.00.36"),
    not a bare number ("2026") or a short fragment ("h1")."""
    return (
        len(token) >= _CODE_MIN_CHARS
        and bool(_DIGIT_RE.search(token))
        and (bool(_LETTER_RE.search(token)) or any(sep in token for sep in ".-/"))
    )


def code_terms(keywords: Sequence[str]) -> List[str]:
    return [kw for kw in keywords if is_code(kw)]


def capitalized_codes(query: Optional[str]) -> List[str]:
    """Letter-only identifiers written in capitals ("HKVHBW", "WRHL"), lowercased.

    ``is_code`` needs a digit; a capitalized word in an otherwise normally written question
    names a product the same way. A question typed in capitals carries no such signal."""
    words = [w for w in _CAPS_WORD_RE.findall(query or "") if _LETTER_RE.search(w)]
    upper = [w for w in words if w.isupper()]
    caps = [w for w in upper if _ALPHA_RE.match(w) and len(w) >= _CODE_MIN_CHARS]
    if not caps or len(upper) * 2 > len(words):
        return []
    return list(dict.fromkeys(w.lower() for w in caps))


def compound_word_parts(token: str, lang: Optional[str] = None) -> List[str]:
    """Searchable parts of a hyphenated token holding a real word ("24-v-sensoren" →
    ["24", "sensoren"]); ``[]`` for identifiers ("ek-h1", "mkh-1k", "10.00.00.36").

    Whether such a token is a variant name ("1100-rechts") or a compound word depends on
    the corpus, so callers use the parts only when the token itself matches nothing."""
    if "-" not in token:
        return []
    parts = [part for part in token.split("-") if part]
    if not any(_ALPHA_RE.match(part) and len(part) >= _MIN_STEM_CHARS for part in parts):
        return []
    stop = stopwords_for(lang)
    return [
        part for part in dict.fromkeys(parts)
        if part not in stop and len(part) >= (MIN_CODE_CHARS if _DIGIT_RE.search(part) else MIN_WORD_CHARS)
    ]


def informative_terms(keywords: Sequence[str]) -> List[str]:
    """Codes and long words only: a cheaper, more selective query than all ``keywords``."""
    return [kw for kw in keywords if is_code(kw) or len(kw) >= _INFORMATIVE_MIN_CHARS]


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


class Phrase(str):
    """A keyword whose words must appear in sequence ("edge 70 pro")."""


def number_phrases(keywords: Sequence[str]) -> List[Phrase]:
    """Model-name phrases around the first bare number with a word beside it, longest
    first: ["edge 70 pro", "edge 70"] for "is motorola edge 70 pro available".

    Such a name holds no code and each of its words is common, so only the words in
    sequence identify it."""
    words = list(keywords)
    for i, token in enumerate(words):
        if not _BARE_NUMBER_RE.match(token):
            continue
        before = words[i - 1] if i > 0 and _ALPHA_RE.match(words[i - 1]) else ""
        after = words[i + 1] if i + 1 < len(words) and _ALPHA_RE.match(words[i + 1]) else ""
        if before and after:
            return [Phrase(f"{before} {token} {after}"), Phrase(f"{before} {token}")]
        if before or after:
            return [Phrase(" ".join(word for word in (before, token, after) if word))]
    return []


def _is_written_as_name(word: str) -> bool:
    return all(part[:1].isupper() for part in word.split("-"))


def name_phrases(query: Optional[str], lang: Optional[str] = None) -> List[Phrase]:
    """Phrases for the first product name written as a capitalized hyphenated word, longest
    first: ["sole-master dry", "sole-master"] for "Artikelnummer des Sole-Master Dry?",
    ["ssl-s"] for "Schmutzschublade SSL-S".

    Keyword extraction splits such a word into common parts ("sole", "master"); the
    passage that names the product spells it whole, as Postgres indexes it. Lowercase
    compounds ("built-in") are ordinary words, not names."""
    raw = _QUERY_TOKEN_RE.findall(query or "")
    stop = stopwords_for(keyword_language(query, lang))
    for i, word in enumerate(raw):
        if "-" not in word or _DIGIT_RE.search(word) or not _is_written_as_name(word):
            continue
        name = word.lower()
        nxt = raw[i + 1].lower() if i + 1 < len(raw) else ""
        if nxt and nxt not in stop and len(nxt) >= (MIN_CODE_CHARS if _DIGIT_RE.search(nxt) else MIN_WORD_CHARS):
            return [Phrase(f"{name} {nxt}"), Phrase(name)]
        return [Phrase(name)]
    return []


def _tsquery_term(token: str, lang: Optional[str]) -> str:
    form = match_form(token, lang)
    prefix = len(form) >= _MIN_STEM_CHARS and "-" not in form
    return f"{form}:*" if prefix else form


def tsquery_text(keywords: Sequence[str], lang: Optional[str]) -> str:
    """OR query of light stems for ``to_tsquery('simple', …)``; prefix match from 4 chars.

    A ``Phrase`` matches its words in sequence and keeps hyphenated words whole, which
    Postgres expands the way it indexed them; other keywords match any of their words."""
    terms: List[str] = []
    for kw in keywords:
        split = _QUERY_TOKEN_RE.findall((kw or "").lower()) if isinstance(kw, Phrase) else _tokens(kw or "")
        tokens = [token for token in split if len(token) >= MIN_CODE_CHARS]
        if isinstance(kw, Phrase) and len(tokens) > 1:
            group = ["(" + " <-> ".join(_tsquery_term(token, None) for token in tokens) + ")"]
        else:
            group = [_tsquery_term(token, lang) for token in tokens]
        for term in group:
            if term not in terms:
                terms.append(term)
    return " | ".join(terms)


def joined_hyphenated(text: str, max_chars: int = 20000) -> str:
    """Hyphenated tokens without their hyphens, space-joined for the full-text index."""
    if not text or "-" not in text:
        return ""
    parts: List[str] = []
    size = 0
    for token in dict.fromkeys(_HYPHENATED_RE.findall(text.lower())):
        joined = token.replace("-", "")
        if not MIN_WORD_CHARS < len(joined) <= _JOINED_MAX_CHARS:
            continue
        size += len(joined) + 1
        if size > max_chars:
            break
        parts.append(joined)
    return " ".join(parts)


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
