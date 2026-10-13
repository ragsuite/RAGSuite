"""Shared, deterministic query processing for Chat and Search (no LLM, no I/O).

``process_query`` turns the raw user text into a ``ProcessedQuery``:

* ``processed``       — safely cleaned text (Unicode/whitespace/noise only)
* ``retrieval_query`` — cleaned text minus conversational filler; never adds terms
* ``language``        — detected question language (``None`` when uncertain)
* ``intent``/``constraints``/``entities`` — cheap signals for routing and gating

The original text is always kept so callers can persist/display it unchanged.
"""
from __future__ import annotations

import os
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from . import query_signals
from .query_keywords import extract_keywords
from .query_language import detect_text_language, normalize_lang_code
from .stopwords import stopwords_for

_MAX_ENTITIES = 8
_SIMPLE_MAX_WORDS = 12
_AMBIGUOUS_MAX_WORDS = 9

_KEEP_SYMBOLS = frozenset("★☆₹$€£¥%")
_REPEAT_PUNCT_RX = re.compile(r"([!?.,;:])\1{1,}")
_WS_RX = re.compile(r"\s+")
_QUOTED_RX = re.compile(r"[\"“”«»„]([^\"“”«»„]{2,80})[\"“”«»„]")
_CODE_RX = re.compile(r"\b(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9-]{1,24}\b")
_NAME_WORD_RX = re.compile(r"[^\W\d_][\w&'.+-]*", re.UNICODE)
_MAX_NAME_WORDS = 8

# Leading conversational filler removed for retrieval only (the LLM still sees the full question).
_FILLER_RX = re.compile(
    r"^\s*(?:hi|hello|hey|hallo|bonjour|hola|ol[aá])?[,!\s]*"
    r"(?:(?:can|could|would|will) you(?: please)?\s+"
    r"(?:tell|show|give|explain|find|list|summari[sz]e|share|provide|send)"
    r"(?: with)?(?: me| us)?(?: about| on)?|"
    r"please\s+(?:tell|show|give|explain|find|list|summari[sz]e|share|provide|send)"
    r"(?: with)?(?: me| us)?(?: about| on)?(?: what the (?:site|website|page) says about)?|"
    r"(?:share|send)(?: with)? (?:me|us)\b|"
    r"tell me about|i (?:want|would like) to know(?: about)?|i need (?:details|information|info)"
    r"(?: (?:on|about|related to|regarding))?:?|i(?:'m| am) looking for|"
    r"what information do you have (?:on|about)|kannst du mir (?:bitte )?(?:sagen|zeigen|erkl[aä]ren)|"
    r"k[oö]nnen sie mir (?:bitte )?(?:sagen|zeigen|erkl[aä]ren)|pouvez-vous me (?:dire|montrer|expliquer)|"
    r"peux-tu me (?:dire|montrer|expliquer)|(?:puedes|podr[ií]as) decirme|voc[eê] pode me (?:dizer|mostrar))"
    r"\s*",
    re.IGNORECASE,
)
_TRAILING_POLITE_RX = re.compile(r"[,\s]*(?:please|bitte|s'il vous pla[iî]t|por favor)\s*([?.!]*)\s*$", re.IGNORECASE)

# Deictic / anaphoric references that need a referent (multilingual).
_DEICTIC_RX = re.compile(
    r"\b(it|its|this|that|these|those|they|them|one|ones|other|another|same|former|latter|"
    r"es|das|dies|diese[rsmn]?|jene[rsmn]?|davon|dazu|ihn|ihm|il|elle|ça|cela|celui|celle|ceux|"
    r"eso|esto|ese|esa|este|esta|ello|isso|isto|esse|essa|aquilo|"
    r"iska|iski|iske|isko|uska|uski|uske|usko|inka|unka)\b|هذا|هذه|ذلك|تلك|这个|那个|它|另一个|इसका|इसकी|इसके|उसका|उसकी|उसके",
    re.IGNORECASE | re.UNICODE,
)
# Open selection questions ("which … should I choose", "what is the best …").
_SELECTION_RX = re.compile(
    r"\b(which|what(?:'s| is| are)? the best|welche[rsmn]?|quel(?:le)?s?|cu[aá]l(?:es)?|qual(?:is)?)\b"
    r"|哪个|أي",
    re.IGNORECASE | re.UNICODE,
)
# Words that never identify *what* the user means on their own.
_GENERIC_TERMS = frozenset(
    """
    price prices cost costs cheap cheaper cheapest expensive better best good great quality
    discount discounts deal deals offer offers model models product products item items thing
    things one ones available availability warranty guarantee color colour colors colours blue
    red black white size sizes dimension dimensions installation refund refunds fee fees
    compatible compatibility recommend recommendation choose pick buy purchase use using safe
    latest new newest suitable machine option options version versions rating ratings review
    reviews stock delivery shipping more less other another second first third last something
    anything stuff kind type types work works worth highest lowest higher lower much many
    now today currently include includes included including come comes
    preis kosten günstiger besser beste gut produkt modell angebot rabatt farbe größe garantie
    prix moins cher meilleur produit modèle offre couleur taille precio barato mejor producto
    modelo oferta tamaño preço barato melhor produto modelo oferta tamanho
    green grey gray silver gold pink blau rot schwarz weiß weiss grün grau silber bleu rouge
    noir blanc vert gris azul rojo negro blanco verde vermelho preto branco cinza
    """.split()
)


@dataclass
class ProcessedQuery:
    original: str
    processed: str
    retrieval_query: str
    language: Optional[str] = None
    intent: str = query_signals.INTENT_GENERAL
    entities: List[str] = field(default_factory=list)
    constraints: Dict[str, Any] = field(default_factory=dict)
    content_terms: List[str] = field(default_factory=list)
    is_simple: bool = True
    is_ambiguous_ref: bool = False
    explicit_multi_source: bool = False

    @property
    def has_constraints(self) -> bool:
        return bool(self.constraints)

    @property
    def is_high_risk(self) -> bool:
        """Answers that hinge on exact facts (numbers, comparisons, filters)."""
        return self.intent in (
            query_signals.INTENT_COMPARE,
            query_signals.INTENT_FILTER,
            query_signals.INTENT_ATTRIBUTE,
        ) or self.has_constraints or self.explicit_multi_source

    def to_meta(self) -> Dict[str, Any]:
        """Compact, JSON-safe summary for ``retrieval_meta`` / execution snapshots."""
        return {
            "query_intent": self.intent,
            "entities": list(self.entities),
            "constraints": dict(self.constraints),
            "retrieval_query": self.retrieval_query if self.retrieval_query != self.processed else None,
            "query_simple": self.is_simple,
        }


def is_enabled() -> bool:
    raw = (os.environ.get("RAG_QUERY_PROCESSING") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def clean_query(text: Optional[str]) -> str:
    """Safe normalisation: NFKC, control/emoji noise removed, whitespace collapsed.

    Punctuation, numbers, currency symbols, URLs, codes and every script are preserved.
    """
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKC", str(text))
    chars: List[str] = []
    for ch in normalized:
        if ch in _KEEP_SYMBOLS:
            chars.append(ch)
            continue
        cat = unicodedata.category(ch)
        if cat == "Cc":
            chars.append(" ")
        elif cat == "Cf" and ch not in ("\u200c", "\u200d"):
            continue
        elif cat == "So" and ord(ch) >= 0x2190:
            # Pictographs/emoji/arrows carry no retrieval meaning.
            chars.append(" ")
        else:
            chars.append(ch)
    cleaned = "".join(chars)
    cleaned = _REPEAT_PUNCT_RX.sub(r"\1", cleaned)
    return _WS_RX.sub(" ", cleaned).strip()


def strip_filler(text: str) -> str:
    """Remove leading conversational filler/trailing politeness; never returns empty."""
    stripped = _FILLER_RX.sub("", text, count=1)
    stripped = _TRAILING_POLITE_RX.sub(r"\1", stripped).strip(" ,:;")
    stripped = re.sub(r'^"(.+)"([?.!]*)$', r"\1\2", stripped).strip()
    return stripped if len(stripped) >= 2 else text


def _is_capitalised(word: str) -> bool:
    return word[:1].isupper() or any(c.isupper() for c in word[1:])


def _capitalised_runs(text: str) -> List[List[str]]:
    """Adjacent capitalised words ("Bling Leader Illuminating Moisturizer"); a lowercase
    word or punctuation between two words ends the name."""
    runs: List[List[str]] = []
    run: List[str] = []
    last_end = 0
    for m in _NAME_WORD_RX.finditer(text):
        word = m.group(0)
        if run and (not _is_capitalised(word) or not text[last_end:m.start()].isspace()):
            runs.append(run)
            run = []
        if _is_capitalised(word):
            run.append(word)
            last_end = m.end()
    if run:
        runs.append(run)
    return runs


def extract_entities(text: str, lang: Optional[str]) -> List[str]:
    """Quoted spans, product/model codes and capitalised names (case kept, deduped)."""
    stop = stopwords_for(lang)
    found: Dict[str, str] = {}

    def _add(value: str) -> None:
        value = value.strip(" .,:;!?\"'")
        key = value.lower()
        if len(value) >= 2 and key not in found and key not in stop and key not in _GENERIC_TERMS:
            found[key] = value

    for m in _QUOTED_RX.finditer(text):
        _add(m.group(1))
    for m in _CODE_RX.finditer(text):
        _add(m.group(0))
    for words in _capitalised_runs(text):
        # Sentence-initial capitalised function words ("What", "Show") are not names.
        while words and words[0].lower() in stop:
            words = words[1:]
        words = words[:_MAX_NAME_WORDS]
        if words and (len(words) > 1 or len(words[0]) >= 3):
            _add(" ".join(words))
    return list(found.values())[:_MAX_ENTITIES]


def refers_back(text: str) -> bool:
    """The text points at something said before ("it", "that one", "which …")."""
    return bool(_DEICTIC_RX.search(text or "") or _SELECTION_RX.search(text or ""))


def asks_selection(text: str) -> bool:
    """An open selection question ("which one …", "what is the best …")."""
    return bool(_SELECTION_RX.search(text or ""))


def points_back(text: str) -> bool:
    """A pronoun or determiner points at something said before ("it", "that one"); an open
    "which …" question alone does not."""
    return bool(_DEICTIC_RX.search(text or ""))


def _content_terms(text: str, lang: Optional[str]) -> List[str]:
    return [t for t in extract_keywords(text, lang) if t not in _GENERIC_TERMS and not t.isdigit()]


def process_query(text: Optional[str], *, language_hint: Optional[str] = None) -> ProcessedQuery:
    """Deterministic understanding of one user query; safe to call on every request."""
    original = "" if text is None else str(text)
    processed = clean_query(original)
    if not processed:
        return ProcessedQuery(original=original, processed="", retrieval_query="", is_simple=True)
    language = detect_text_language(processed) or normalize_lang_code(language_hint)
    retrieval_query = strip_filler(processed)
    constraints = query_signals.extract_constraints(processed)
    intent, multi = query_signals.detect_intent(processed, constraints)
    entities = extract_entities(retrieval_query, language)
    content = _content_terms(retrieval_query, language)
    words = processed.split()

    ambiguous = False
    if len(words) <= _AMBIGUOUS_MAX_WORDS and not entities and not content:
        deictic = refers_back(processed)
        attribute_only = intent in (
            query_signals.INTENT_ATTRIBUTE,
            query_signals.INTENT_COMPARE,
            query_signals.INTENT_FILTER,
        ) and not constraints
        ambiguous = deictic or attribute_only

    is_simple = (
        len(words) <= _SIMPLE_MAX_WORDS
        and intent in (query_signals.INTENT_GENERAL, query_signals.INTENT_DEFINITION, query_signals.INTENT_BROWSE)
        and not constraints
        and not ambiguous
        and not multi
    )
    return ProcessedQuery(
        original=original,
        processed=processed,
        retrieval_query=retrieval_query,
        language=language,
        intent=intent,
        entities=entities,
        constraints=constraints,
        content_terms=content,
        is_simple=is_simple,
        is_ambiguous_ref=ambiguous,
        explicit_multi_source=multi,
    )
