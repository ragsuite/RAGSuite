"""Names in a yes/no question that no retrieved passage mentions ("Do you ship to the USA?").

Models answer such questions with an inferred "yes" from a general policy that never
names the place or item. Flagging the unmentioned name lets the prompt require "not
stated" instead. Limited to yes/no questions; multi-word names count as mentioned when
each of their words appears, so a slightly different product wording is not flagged.
"""
from __future__ import annotations

import re
from typing import List, Optional

from .query_processing import extract_entities

_YES_NO_RX = re.compile(
    r"^\s*(do|does|did|is|are|can|could|will|would|has|have|should|"
    r"ist|sind|kann|können|konnen|gibt|hat|haben|liefert|liefern|bietet|bieten|"
    r"¿?\s*(hay|puedo|pueden|es|son|tienen|envían|envian|hacen)|"
    r"est-ce|puis-je|avez-vous|livrez-vous|y a-t-il)\b",
    re.IGNORECASE | re.UNICODE,
)
_WORD_RX = re.compile(r"\w+", re.UNICODE)
_MAX_FLAGGED = 3


def _compact(text: str) -> str:
    return "".join(_WORD_RX.findall(text.lower()))


def is_yes_no_question(question: str) -> bool:
    return bool(_YES_NO_RX.match(question or ""))


def unmentioned_names(question: str, context: str, lang: Optional[str] = None) -> List[str]:
    """Names from a yes/no ``question`` that ``context`` never mentions (at most a few)."""
    opener = _YES_NO_RX.match(question or "")
    if not opener or not context:
        return []
    context_words = set(_WORD_RX.findall(context.lower()))
    context_compact = _compact(context)
    flagged: List[str] = []
    for name in extract_entities(question[opener.end():], lang):
        words = [w for w in _WORD_RX.findall(name.lower()) if len(w) >= 2]
        if not words:
            continue
        if len(words) == 1:
            if words[0] in context_words:
                continue
        elif _compact(name) in context_compact or all(w in context_words for w in words):
            continue
        flagged.append(name)
    return flagged[:_MAX_FLAGGED]


def unmentioned_instruction(question: str, context: str, lang: Optional[str] = None) -> str:
    names = unmentioned_names(question, context, lang)
    if not names:
        return ""
    listed = ", ".join(f'"{n}"' for n in names)
    return (
        f"NOT IN DOCUMENTS: the DOCUMENTS never mention {listed}. Unless a passage clearly "
        "refers to it under another name, do not answer yes or no about it and do not infer "
        "it from a general policy: say you don't have information about it (without mentioning "
        "documents), and give the support contact (email/phone) that appears in the DOCUMENTS, if any."
    )
