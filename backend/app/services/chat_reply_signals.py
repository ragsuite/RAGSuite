"""Does a chat message reply to the assistant's pending question, or start a new turn?

After the assistant ends with a question ("Would you like details on the Pop mascara
instead?"), only a reply-shaped message is folded into that question: an acceptance or
refusal ("yes", "no thanks"), a pick among what it offered ("the second one", "Pop"), or,
when the assistant asked back instead of answering, the missing detail ("of the kohl").
Anything else ("nah. how many days to return") is a new turn and goes through the normal
follow-up / standalone resolution.
"""
from __future__ import annotations

import re
from typing import Optional, Set

from .chat_followup_cues import CHOICE_REF_RE
from .chat_reference_signals import (
    CONVERSATIONAL_TERMS,
    QUESTION_WORDS,
    _AMBIGUOUS_REF_RE,
    _content_tokens,
    _fold_plural,
)
from .chat_topic_memory import PendingQuestion
from .rag.query_processing import ProcessedQuery

# Refusals of an offer: the reply declines rather than accepts.
NEGATIONS = frozenset("no nah na nope nahi nein non".split())
# Words that accept or refuse an offer without asking anything ("yes please", "sure, go ahead",
# "no thanks", "tell me more"), in the chat languages the cue lists cover.
_ACK_WORDS = CONVERSATIONAL_TERMS | NEGATIONS | frozenset(
    """
    go ahead tell show me more details detail please pls plz do it that one the of course fine alright
    haan han ha ji theek accha acha ja gerne bitte oui si sí claro sim certo yup ya
    """.split()
)
_ORDINAL_RX = re.compile(
    r"\b(?:first|second|third|fourth|fifth|last|former|latter|both|either|neither|\d(?:st|nd|rd|th))\b",
    re.IGNORECASE,
)
_WORD_RX = re.compile(r"[^\W_]+", re.UNICODE)
# A question word within the first three words ("nah. how many days", "ugh fine, is cod …").
_QUESTION_LEAD_RX = re.compile(rf"^\W*(?:[^\W\d_]+\W+){{0,2}}?(?:{QUESTION_WORDS})\b", re.IGNORECASE)
_PICK_MAX_WORDS = 8
_ORDINAL_MAX_WORDS = 4


def _words(text: str) -> list:
    return [w.lower() for w in _WORD_RX.findall(text or "")]


def is_acknowledgement(message: str) -> bool:
    """Only accepts or refuses ("yes", "ok sure", "no thanks", "haan batao" is not)."""
    words = _words(message)
    return bool(words) and all(w in _ACK_WORDS for w in words)


def accepts_offer(message: str) -> bool:
    words = _words(message)
    return is_acknowledgement(message) and not any(w in NEGATIONS for w in words)


def _own_terms(message: str) -> Set[str]:
    return {_fold_plural(t) for t in _content_tokens(message)} - CONVERSATIONAL_TERMS - _ACK_WORDS


def _picks_offered_option(message: str, question: str) -> bool:
    """Most of the message's own words come from the assistant's question ("Pop mascara")."""
    if len(_words(message)) > _PICK_MAX_WORDS:
        return False
    own = _own_terms(message)
    offered = {_fold_plural(t) for t in _content_tokens(question)}
    return bool(own) and 2 * len(own & offered) >= len(own)


def asks_new_question(message: str, pq: Optional[ProcessedQuery]) -> bool:
    """A question that names its own subject ("how many days to return", "is cod refundable?")."""
    text = (message or "").strip()
    if pq is None or pq.is_ambiguous_ref:
        return False
    if not (text.endswith(("?", "？")) or _QUESTION_LEAD_RX.search(text)):
        return False
    return bool(pq.entities) or len(_own_terms(text)) >= 2


def is_reply(message: str, pending: PendingQuestion, pq: Optional[ProcessedQuery]) -> bool:
    """Whether ``message`` answers ``pending`` (see module docstring)."""
    text = (message or "").strip()
    if not text:
        return False
    if is_acknowledgement(text):
        return True
    short = len(_words(text)) <= _ORDINAL_MAX_WORDS
    if short and (_ORDINAL_RX.search(text) or CHOICE_REF_RE.search(text)):
        return True
    if _picks_offered_option(text, pending.question):
        return True
    if not _own_terms(text) and not _AMBIGUOUS_REF_RE.search(text):
        return True
    return not pending.answered and not asks_new_question(text, pq)
