"""Per-language wording that marks a short chat turn as continuing the conversation.

"und die Nass-Version?", "et la version 800 ?", "wirklich?" depend on the last exchange
just like "and the 512 version?" or "really?". Each language lists:

- ``fillers``: discourse words that may precede an opener ("ok", "hmm", "also").
- ``openers``: phrases that start a continuation ("what about", "und", "qu'en est-il de").
- ``determiners`` + ``variants``: a pick among the things just discussed ("the 256gb one",
  "die Links-Variante").
- ``anaphors``: words that can only point back ("er", "davon", "celui"). English pronouns
  stay with the entity-aware checks in ``chat_reference_signals``; other languages need
  them here because capitalised nouns (German) defeat those checks.
- ``additive``: "also/too" anywhere in a short turn ("kann man den auch trocken betreiben?").
- ``doubt``: confirmation tags that never name a subject ("wirklich", "vraiment").
- ``fragments``: prepositions that open a bare qualifier of the last question ("in yellow",
  "with 512 GB", "mit Deckel?", "sans sucre ?").
- ``superlatives``: markers of a superlative whose noun is left out at the end of the turn
  ("I want most popular", "le plus cher ?"): the noun is whatever was just discussed.

Lists are lowercase; matching is case-insensitive. Languages follow ``rag.stopwords``.
"""
from __future__ import annotations

import re
from typing import Dict, FrozenSet

_CUES: Dict[str, Dict[str, str]] = {
    "en": {
        "fillers": "ok|okay|hmm+|so|well|then|and",
        # "n" is chat shorthand for "and" ("n the matte one?").
        "openers": "what about|how about|and|n|also",
        "determiners": "the|that|this",
        "variants": "one|ones|version|variant|model",
        "anaphors": "",
        "additive": "",
        "doubt": "",
        "fragments": "in|with|without|for",
        "superlatives": "most|least|the most|the least",
    },
    "de": {
        "fillers": "ok|okay|hmm+|also|gut|na|und",
        "openers": "und|auch|was ist mit|wie ist es mit|wie sieht es mit|wie steht es mit",
        "determiners": "der|die|das|den|dem|diese|dieser|dieses|diesen|diesem",
        "variants": "version|variante|ausführung|modell|typ",
        "anaphors": "er|ihn|ihm|davon|dazu|damit|dafür|daran|darin|darauf|darüber|dabei",
        "additive": "auch",
        "doubt": "wirklich|sicher|stimmt|echt|korrekt|richtig|genau",
        "fragments": "in|mit|ohne|für",
        # "die meisten Kunden": German superlatives also precede nouns.
        "superlatives": "",
    },
    "fr": {
        "fillers": "ok|okay|d'accord|bon|alors|et",
        "openers": "et|aussi|et pour|qu'en est-il de|quid de",
        "determiners": "le|la|les|ce|cet|cette",
        "variants": "version|variante|modèle",
        "anaphors": "celui|celle|ceux|celles",
        "additive": "aussi",
        "doubt": "vraiment|sûr|sûre|exact|exacte|correct|certain",
        "fragments": "en|avec|sans|pour",
        "superlatives": "le plus|la plus|les plus|le moins|la moins|les moins",
    },
    "es": {
        "fillers": "ok|vale|bueno|entonces|y",
        "openers": "y|también|qué hay de|que hay de|qué tal",
        "determiners": "el|la|los|las|ese|esa|este|esta",
        "variants": "versión|version|variante|modelo",
        "anaphors": "él|ella|ellos|ellas|eso|esto",
        "additive": "también",
        "doubt": "seguro|segura|verdad|cierto|correcto",
        "fragments": "en|con|sin|para",
        "superlatives": "el más|la más|lo más|los más|las más|el menos|la menos",
    },
    "pt": {
        "fillers": "ok|bom|então|e",
        "openers": "e|também|e quanto a|que tal",
        "determiners": "o|os|as|esse|essa|este|esta",
        "variants": "versão|variante|modelo",
        "anaphors": "ele|ela|eles|elas|disso|dele|dela",
        "additive": "também",
        "doubt": "certeza|verdade|certo|correto",
        "fragments": "em|com|sem|para",
        "superlatives": "o mais|a mais|os mais|as mais|o menos|a menos",
    },
    "it": {
        "fillers": "ok|bene|allora|e",
        "openers": "e|anche|e per|che mi dici di",
        "determiners": "il|lo|la|gli|le|quel|quella|questo|questa",
        "variants": "versione|variante|modello",
        "anaphors": "esso|essa|lui|lei",
        "additive": "anche",
        "doubt": "davvero|sicuro|sicura|vero|certo|corretto",
        "fragments": "in|con|senza|per",
        "superlatives": "il più|la più|i più|le più|il meno|la meno",
    },
    "nl": {
        "fillers": "ok|oké|nou|dus|en",
        "openers": "en|ook|wat dacht je van|hoe zit het met",
        "determiners": "de|het|die|dat|deze|dit",
        "variants": "versie|variant|model",
        "anaphors": "hij|hem|ervan|erover|daarvan",
        "additive": "ook",
        "doubt": "echt|zeker|klopt|juist|correct",
        "fragments": "in|met|zonder|voor",
        "superlatives": "meest|minst|het meest|het minst",
    },
}

# A cue word must stand alone: "e-bike" or "y-axis" do not open a continuation.
_END = r"(?=[\s,.!?;:]|$)"


def _alternation(field: str) -> str:
    parts: set = set()
    for cues in _CUES.values():
        parts.update(p.strip() for p in cues[field].split("|") if p.strip())
    ordered = sorted(parts, key=len, reverse=True)
    return "|".join(re.escape(p).replace(r"\ ", r"\s+").replace(r"\+", "+") for p in ordered)


def _words(field: str) -> FrozenSet[str]:
    return frozenset(
        word for cues in _CUES.values() for word in cues[field].split("|") if word
    )


OPENER_RE = re.compile(
    rf"^\W*(?:(?:{_alternation('fillers')}){_END}\W*)*(?:{_alternation('openers')}){_END}",
    re.IGNORECASE,
)
CHOICE_REF_RE = re.compile(
    rf"\b(?:{_alternation('determiners')})\s+(?:[^\W_]+[\s-]+){{0,2}}?(?:{_alternation('variants')})\b",
    re.IGNORECASE,
)
BACK_REFERENCE_RE = re.compile(
    rf"(?<![\w-])(?:{_alternation('anaphors')}|{_alternation('additive')}){_END}",
    re.IGNORECASE,
)
DOUBT_TERMS: FrozenSet[str] = _words("doubt")
FRAGMENT_RE = re.compile(
    rf"^\W*(?:(?:{_alternation('fillers')}){_END}\W*)*(?:{_alternation('fragments')}){_END}",
    re.IGNORECASE,
)
HEADLESS_SUPERLATIVE_RE = re.compile(
    rf"(?<![\w-])(?:{_alternation('superlatives')})\s+[^\W\d_]+[\s.!?。！？]*$",
    re.IGNORECASE,
)
