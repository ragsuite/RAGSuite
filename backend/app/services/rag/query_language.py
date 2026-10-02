"""Lightweight, dependency-free language detection for questions and chunk text.

Script ranges identify non-Latin languages; Latin languages are scored by function
words, diacritics and (German only) common suffixes. Returns ``None`` whenever the
evidence is weak (brand-only queries, mixed text) so callers stay neutral.
"""
from __future__ import annotations

import re
from typing import Dict, Optional, Set

_SCRIPT_RANGES = (
    ("ja", re.compile(r"[\u3040-\u30ff]")),
    ("ko", re.compile(r"[\uac00-\ud7af]")),
    ("zh", re.compile(r"[\u4e00-\u9fff]")),
    ("ar", re.compile(r"[\u0600-\u06ff]")),
    ("ru", re.compile(r"[\u0400-\u04ff]")),
)
_LETTER_RE = re.compile(r"[^\W\d_]", re.UNICODE)
_WORD_RE = re.compile(r"[a-zà-öø-ÿß]+(?:-[a-zà-öø-ÿß]+)?")

_FUNCTION_WORDS: Dict[str, Set[str]] = {
    "en": set(
        "the is are was were what which who whom how why where when does do did can could "
        "you your of and to for with on at from this that these those there have has about "
        "an a it be my me i in us we our they its any much many offer provide tell please".split()
    ),
    "de": set(
        "der die das den dem des ein eine einen einem einer und ist sind nicht mit für auf in "
        "von zu im bei gibt es ich sie wir ihr kann können haben hat oder auch nach über "
        "unter wer was wann wo wie warum welche welcher welches welchen wieviel viel gibt's "
        "an mir mich uns euch ihre ihr sich bitte zum zur vom".split()
    ),
    "fr": set(
        "le la les un une des du de est sont et ou que qui quoi quel quelle quels quelles "
        "comment pourquoi où avec pour sur dans vous nous je ce cette ces pas au aux "
        "est-ce votre vos mon ma mes".split()
    ),
    "es": set(
        "el la los las un una unos unas de del es son y que qué cuál cuáles cómo dónde "
        "cuándo por para con en se su sus lo al está están hay usted ustedes mi".split()
    ),
    "pt": set(
        "o os a as um uma de do da dos das é são e que qual quais como onde quando por "
        "para com em no na nos nas você vocês não tem seu sua".split()
    ),
    "it": set(
        "il lo la gli le un una di del della dei è sono e che quale quali come dove quando "
        "perché per con in nel nella non cosa mi ci vi".split()
    ),
    "nl": set(
        "de het een en is zijn van wat welke hoe waar waarom wie wanneer met voor op niet "
        "ook er ik u jullie bij mijn uw in".split()
    ),
}
_WORD_LANGS: Dict[str, tuple] = {}
for _lang, _words in _FUNCTION_WORDS.items():
    for _word in _words:
        _WORD_LANGS[_word] = _WORD_LANGS.get(_word, ()) + (_lang,)

_DIACRITIC_HINTS = (
    (re.compile(r"[äöüß]"), ("de",), 1.5),
    (re.compile(r"[ñ¿¡]"), ("es",), 1.5),
    (re.compile(r"[ãõ]"), ("pt",), 1.5),
    (re.compile(r"[èêâîûëïœ]"), ("fr",), 1.0),
    (re.compile(r"[ìò]"), ("it",), 1.0),
    (re.compile(r"ç"), ("fr", "pt"), 0.5),
)
_GERMAN_SUFFIX_RE = re.compile(r"(?:ung|keit|heit|lich|schaft|isch|chen)(?:en|e|s)?$")

_MIN_SCORE = 1.0
_MIN_MARGIN = 0.75
_SCRIPT_SHARE = 0.3
_MAX_SCAN_CHARS = 2000


def normalize_lang_code(code: object) -> Optional[str]:
    """``de-DE`` / ``de_de`` / ``DE`` → ``de``; ``None`` for anything unusable."""
    if code is None:
        return None
    base = str(code).strip().lower().replace("_", "-").split("-", 1)[0]
    if 2 <= len(base) <= 3 and base.isalpha():
        return base
    return None


def _script_language(text: str) -> Optional[str]:
    letters = len(_LETTER_RE.findall(text))
    if not letters:
        return None
    counts = {lang: len(rx.findall(text)) for lang, rx in _SCRIPT_RANGES}
    if counts["ja"] and counts["ja"] + counts["zh"] >= letters * _SCRIPT_SHARE:
        return "ja"
    lang, count = max(counts.items(), key=lambda kv: kv[1])
    return lang if count >= letters * _SCRIPT_SHARE else None


def _latin_scores(text: str) -> Dict[str, float]:
    scores: Dict[str, float] = {lang: 0.0 for lang in _FUNCTION_WORDS}
    for word in _WORD_RE.findall(text):
        langs = _WORD_LANGS.get(word)
        if langs:
            share = 1.0 / len(langs)
            for lang in langs:
                scores[lang] += share
        elif len(word) >= 7 and _GERMAN_SUFFIX_RE.search(word):
            scores["de"] += 0.5
    for rx, langs, weight in _DIACRITIC_HINTS:
        if rx.search(text):
            for lang in langs:
                scores[lang] += weight
    return scores


def detect_text_language(text: object) -> Optional[str]:
    """Best-guess base language code of ``text``, or ``None`` when uncertain."""
    sample = str(text or "")[:_MAX_SCAN_CHARS].lower()
    if not sample.strip():
        return None
    script = _script_language(sample)
    if script:
        return script
    ranked = sorted(_latin_scores(sample).items(), key=lambda kv: kv[1], reverse=True)
    (best, best_score), (_, second_score) = ranked[0], ranked[1]
    if best_score >= _MIN_SCORE and best_score - second_score >= _MIN_MARGIN:
        return best
    return None
