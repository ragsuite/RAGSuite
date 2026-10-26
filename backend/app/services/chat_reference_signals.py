"""Deterministic reference/entity signals for chat follow-ups (no I/O, no LLM).

Moved from ``app.routes.rag``; the routes module re-exports these names.
"""
from __future__ import annotations

import re
from typing import Dict, List, Optional, Sequence, Set

from app.services.chat_followup_cues import (
    BACK_REFERENCE_RE,
    CHOICE_REF_RE,
    DOUBT_TERMS,
    FRAGMENT_RE,
    HEADLESS_SUPERLATIVE_RE,
    OPENER_RE,
)
from app.services.rag.query_language import detect_text_language
from app.services.rag.query_processing import _GENERIC_TERMS
from app.services.rag.stopwords import BASE_LANGUAGE, STOPWORDS

# Plural collective references — user means ALL recently discussed entities, not one.
_PLURAL_COLLECTIVE_RE = re.compile(
    r'\b(?:them|these|those|both)\b',
    re.IGNORECASE,
)

# Anaphoric references that may need clarification when referent is unclear.
_AMBIGUOUS_REF_RE = re.compile(
    r'\b(?:'
    r'he|she|they|them|him|her|his|hers|their|theirs|'
    r'it|its|itself|'
    r'one|ones|other|others|another|'
    r'this|that|these|those'
    r')\b',
    re.IGNORECASE,
)

# Distinct named entities / topics in recent history (proper nouns, multi-word names, phases).
_ENTITY_TOKEN_RE = re.compile(
    r'\b(?:'
    r'[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]+)*'
    r'|Phase\s+\d+'
    r')\b',
    re.UNICODE,
)

_AMBIGUITY_ENTITY_STOPWORDS = frozenset({
    "I", "The", "This", "That", "These", "Those", "What", "Who", "When", "Where",
    "Why", "How", "Which", "You", "Your", "We", "They", "It", "He", "She", "If",
    "In", "On", "At", "As", "Or", "And", "But", "For", "Not", "Are", "Was", "Were",
    "Is", "Be", "Can", "Could", "Would", "Should", "May", "Might", "Will", "Do",
    "Does", "Did", "Have", "Has", "Had", "Please", "Thanks", "Thank", "Hello", "Hi",
    "Der", "Die", "Das", "Den", "Dem", "Des", "Ein", "Eine", "Einer", "Einem",
    "Sie", "Ihr", "Ihre", "Wir", "Was", "Wer", "Wie", "Wo", "Wann", "Warum",
    "Ich", "Du", "Er", "Es", "Und", "Oder", "Aber", "Für", "Mit", "Von", "Zu",
    "Bei", "Nach", "Aus", "Auf", "Als", "Auch", "Nicht", "Nur", "Noch", "Sehr",
    "Here", "There", "Yes", "No", "Ok", "Okay",
})

# Content tokens for topic-shift / same-utterance antecedent (lowercase-safe).
_CONTENT_TOKEN_RE = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
_CONTENT_STOPWORDS = frozenset({
    "the", "and", "for", "are", "was", "were", "been", "being", "have", "has", "had",
    "does", "did", "doing", "will", "would", "could", "should", "shall", "may", "might",
    "must", "can", "need", "also", "just", "about", "from", "with", "into", "onto",
    "over", "under", "than", "then", "that", "this", "these", "those", "them", "they",
    "their", "there", "here", "what", "when", "where", "which", "who", "whom", "why",
    "how", "you", "your", "yours", "our", "ours", "its", "his", "her", "hers",
    "please", "tell", "more", "some", "any", "all", "each", "every", "both", "few",
    "many", "much", "such", "only", "own", "same", "other", "another", "very",
    "really", "explain", "describe", "give", "show", "say", "said", "know", "think",
    "like", "want", "need", "use", "used", "using", "make", "made", "get", "got",
    "let", "yes", "yeah", "yep", "no", "not", "nor", "but", "yet", "too", "out",
    "off", "up", "down", "again", "further", "once", "because", "while", "during",
    "before", "after", "above", "below", "between", "through", "against", "without",
    "within", "along", "across", "behind", "beyond", "plus", "via", "per", "etc",
    "hello", "thanks", "thank", "okay", "ok", "well", "still", "already", "even", "sure", "share", "else",
    "something", "anything", "everything", "someone", "anyone", "everyone",
    "question", "answer", "information", "detail", "details", "thing", "things",
})


# Acknowledgements, confirmation tags and request verbs: never a subject or topic
# ("so red is not available right", "correct, so only blue", "hmm ok").
CONVERSATIONAL_TERMS = frozenset(
    """
    okay ok sure yes yeah yep nope please share thanks thank really right correct true wrong
    need want hmm umm actually exactly confirm
    """.split()
) | DOUBT_TERMS


def _extract_entities_from_text(text: str) -> List[str]:
    """Named entities / topics explicitly mentioned in a single text."""
    entities: Dict[str, str] = {}
    for match in _ENTITY_TOKEN_RE.finditer(text or ""):
        token = match.group(0).strip()
        if token in _AMBIGUITY_ENTITY_STOPWORDS:
            continue
        if " " not in token and len(token) < 5 and not token.isupper():
            continue
        key = token.lower()
        if key not in entities:
            entities[key] = token
    return list(entities.values())


def _fold_plural(token: str) -> str:
    """English plural → singular ("brands" → "brand", "batteries" → "battery")."""
    if len(token) <= 3 or not token.endswith("s") or token.endswith("ss"):
        return token
    if token.endswith("ies") and len(token) > 4:
        return token[:-3] + "y"
    if token.endswith(("xes", "ches", "shes", "sses")):
        return token[:-2]
    return token[:-1]


def _content_tokens(text: str, lang: Optional[str] = None) -> Set[str]:
    """Lowercased content tokens for topic overlap (ignores stopwords/pronouns).

    Function words of ``lang`` (detected from ``text`` when omitted) are dropped too, so
    "welche Maße hat er" keeps only "maße"."""
    lang = lang or detect_text_language(text)
    own_stop = STOPWORDS.get(lang, frozenset()) if lang and lang != BASE_LANGUAGE else frozenset()
    out: Set[str] = set()
    for match in _CONTENT_TOKEN_RE.finditer(text or ""):
        token = match.group(0).lower()
        if token in _CONTENT_STOPWORDS or token in own_stop:
            continue
        if len(token) < 3:
            continue
        out.add(token)
    return out


def _message_names_explicit_entity(user_message: str) -> bool:
    """True when the user names a concrete entity/topic in the message itself."""
    return bool(_extract_entities_from_text(user_message))


_DEMONSTRATIVE_RE = re.compile(r"\b(?:this|that|these|those)\b", re.IGNORECASE)
_DEMONSTRATIVE_PRO_FORMS = frozenset({"one", "ones", "other", "others", "another"})


def _message_has_same_utterance_antecedent(user_message: str) -> bool:
    """True when a pronoun is bound to a topical noun phrase earlier in THIS message.

    Example: "is online voting system futuristic? also explain how it can be used?"
    — "it" refers to "online voting system", not prior chat turns.

    Requires at least two content tokens before the pronoun so bare follow-ups like
    "Who is responsible for it?" / "Who operates them?" still need history.
    """
    if not user_message:
        return False
    for match in _AMBIGUOUS_REF_RE.finditer(user_message):
        prefix_tokens = _content_tokens(user_message[: match.start()])
        if len(prefix_tokens) >= 2:
            return True
    return False


def _message_has_demonstrative_noun(user_message: str) -> bool:
    """True when this/that/these/those is followed by a content noun in THIS message.

    "Can I return this laptop?" is self-contained. "that one" / "what about it?" are not.
    """
    if not user_message:
        return False
    for match in _DEMONSTRATIVE_RE.finditer(user_message):
        rest = user_message[match.end() :]
        next_word = _CONTENT_TOKEN_RE.search(rest)
        if not next_word:
            continue
        # Determiner + noun must be adjacent ("this laptop"), not later in the turn.
        if rest[: next_word.start()].strip():
            continue
        token = next_word.group(0).lower()
        if token in _DEMONSTRATIVE_PRO_FORMS or token in _CONTENT_STOPWORDS:
            continue
        return True
    return False


def _message_has_ambiguous_reference(user_message: str) -> bool:
    """True for anaphoric refs (it/they/this/…) but not explicit entity questions."""
    if not _AMBIGUOUS_REF_RE.search(user_message):
        return False
    if _message_names_explicit_entity(user_message):
        return False
    # Same-message antecedent: query is already self-contained.
    if _message_has_same_utterance_antecedent(user_message):
        return False
    if _message_has_demonstrative_noun(user_message):
        return False
    return True


def _message_has_plural_collective_reference(user_message: str) -> bool:
    """True when the message uses a plural pronoun that refers to a group of entities."""
    return bool(_PLURAL_COLLECTIVE_RE.search(user_message))


def _is_topic_shift(user_message: str, history: List[Dict[str, str]]) -> bool:
    """True when the new user turn introduces a topic largely absent from recent history.

    Prevents grafting prior-turn entities (e.g. NITSAN) onto an unrelated question
    (e.g. online voting system) via contextualization or answer-history prompting.
    """
    if not history:
        return False
    msg_tokens = _content_tokens(user_message)
    if len(msg_tokens) < 2:
        return False
    hist_tokens: Set[str] = set()
    for turn in history[-6:]:
        hist_tokens |= _content_tokens(turn.get("content") or "")
    if not hist_tokens:
        return False
    overlap = msg_tokens & hist_tokens
    if not overlap:
        return True
    return (len(overlap) / len(msg_tokens)) < 0.25


def _history_for_chat_answer(
    user_message: str,
    history: List[Dict[str, str]],
) -> Optional[List[Dict[str, str]]]:
    """Conversation history for answer generation — follow-ups only, last 2 Q&A."""
    if not history:
        return None
    if not _is_conversational_followup(user_message, history):
        return None
    return history[-4:]


def _extract_salient_entities(
    history: List[Dict[str, str]],
    *,
    max_turns: int = 6,
) -> List[str]:
    """Distinct salient entities/topics mentioned in recent conversation turns."""
    if not history:
        return []
    entities: Dict[str, str] = {}
    for turn in history[-max_turns:]:
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        for token in _extract_entities_from_text(content):
            key = token.lower()
            if key not in entities:
                entities[key] = token
    return list(entities.values())


def _has_multiple_referent_candidates(history: List[Dict[str, str]]) -> bool:
    """True when the user has introduced two or more distinct salient referents."""
    user_turns = [t for t in history if t.get("type") == "user"]
    return len(_extract_salient_entities(user_turns)) >= 2


def _llm_marked_ambiguous(result_text: str) -> bool:
    """True when contextualization LLM signals unresolved reference."""
    stripped = (result_text or "").strip()
    if not stripped:
        return False
    first_token = stripped.split()[0].upper().rstrip(".,;:!?\"'")
    return first_token == "AMBIGUOUS"



_CONVERSATIONAL_REF_RE = re.compile(
    r'\b(he|she|they|them|his|her|their|hers|theirs'
    r'|this|that|these|those|it|its'
    r'|earlier|before|previously|above|mentioned|said|told|discussed)\b',
    re.IGNORECASE,
)


def _is_conversational_followup(user_message: str, history: List[Dict[str, str]]) -> bool:
    """True when message looks like a follow-up referencing prior conversation."""
    if not history:
        return False
    # Standalone topical questions (incl. same-utterance "it" / "this laptop") are not follow-ups.
    if _message_has_same_utterance_antecedent(user_message):
        return False
    if _message_has_demonstrative_noun(user_message):
        return False
    if _is_topic_shift(user_message, history):
        return False
    return bool(_CONVERSATIONAL_REF_RE.search(user_message))


_ELLIPTICAL_MAX_WORDS = 8
_FRAGMENT_MAX_WORDS = 5
_MARKED_FOLLOWUP_MAX_WORDS = 12
_SHORT_TURN_WORDS = 3
_BARE_FRAGMENT_MAX_WORDS = 3
# Interrogatives and auxiliaries that open a question of its own (English, romanised Hindi).
QUESTION_WORDS = (
    "what|whats|how|which|when|where|why|who|is|are|can|could|do|does|did|will|would|should|"
    "kya|kitna|kitne|kab|kaise|kahan|kaha"
)
_QUESTION_WORD_RX = re.compile(rf"\b(?:{QUESTION_WORDS})\b", re.IGNORECASE)


def is_marked_followup(user_message: str) -> bool:
    """Short turn that says it continues the conversation, whatever it names: an opener
    ("what about RAM", "und die Nass-Version?"), a pick among what was discussed ("the 256gb
    one", "die Links-Variante"), a bare qualifier ("in yellow color", "mit Deckel?"), or in a
    shorter turn a word that only points back ("welche Maße hat er?", "kann man den auch
    trocken betreiben?")."""
    text = (user_message or "").strip()
    words = len(text.split())
    if not text or words > _MARKED_FOLLOWUP_MAX_WORDS:
        return False
    if OPENER_RE.search(text) or CHOICE_REF_RE.search(text):
        return True
    if words <= _FRAGMENT_MAX_WORDS and FRAGMENT_RE.search(text):
        return True
    return words <= _ELLIPTICAL_MAX_WORDS and bool(BACK_REFERENCE_RE.search(text))


def _conversation_language(user_message: str, history: List[Dict[str, str]]) -> Optional[str]:
    """Language of the user's recent turns for a very short turn ("bist du sicher?" reads
    as French on its own), otherwise of the turn itself."""
    recent_user = " ".join(t.get("content") or "" for t in history[-6:] if t.get("type") == "user")
    if len(user_message.split()) <= _SHORT_TURN_WORDS:
        return detect_text_language(recent_user) or detect_text_language(user_message)
    return detect_text_language(user_message) or detect_text_language(recent_user)



def _subject_entities_in(user_message: str, named_entities: Sequence[str]) -> List[str]:
    """Named things in the message, ignoring a capitalised sentence-initial plain word
    ("Share price without offer", "Okay which one")."""
    words = user_message.split()
    first = words[0].strip(".,:;!?\"'") if words else ""
    out: List[str] = []
    for entity in list(named_entities) + _extract_entities_from_text(user_message):
        if entity == first and entity[1:].islower() and len(words) > 1:
            continue
        out.append(entity)
    return out


def is_elliptical_followup(
    user_message: str,
    history: List[Dict[str, str]],
    *,
    named_entities: Sequence[str] = (),
) -> bool:
    """Short turn that names no subject of its own and continues the recent exchange
    ("are you sure?", "bist du sicher?", "price without offer"), says it continues it
    ("what about RAM", "und die Nass-Version?", "give me the 256gb one"), or is a bare
    phrase without a question word ("expiry date?", "shelf life") — the rewriter keeps
    such a phrase unchanged when it is a new topic rather than a detail of the last one."""
    if not history:
        return False
    text = (user_message or "").strip()
    if is_marked_followup(text):
        return True
    if not text or len(text.split()) > _ELLIPTICAL_MAX_WORDS:
        return False
    if _subject_entities_in(text, named_entities):
        return False
    if _message_has_same_utterance_antecedent(text):
        return False
    if _message_has_demonstrative_noun(text):
        return False
    if _AMBIGUOUS_REF_RE.search(text) or HEADLESS_SUPERLATIVE_RE.search(text):
        return True
    if len(text.split()) <= _BARE_FRAGMENT_MAX_WORDS and not _QUESTION_WORD_RX.search(text):
        return True
    return not _subject_tokens(text, _conversation_language(text, history))


def _subject_tokens(user_message: str, lang: Optional[str] = None) -> Set[str]:
    """Content words that name a subject — not attributes like price, offer, colour or size,
    nor confirmation tags. "What is paysafecard?" names one; "share price without offer"
    and "so red is not available right" do not."""
    return {
        token
        for token in _content_tokens(user_message, lang)
        if token not in _GENERIC_TERMS
        and _fold_plural(token) not in _GENERIC_TERMS
        and token not in CONVERSATIONAL_TERMS
    }


def _graceful_context_loss_response() -> str:
    return (
        "I may have covered this earlier in our conversation, but it's outside my current "
        "memory window. Could you restate the specific detail you're looking for?"
    )
