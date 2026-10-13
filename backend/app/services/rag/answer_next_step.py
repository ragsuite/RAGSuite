"""Chat answers that end with a question: clarify (intent unclear) or follow up (offer options).

The model writes a hidden final line ``NEXT_STEP: clarify|follow_up|none``; it is stripped
from everything shown to users (see ``citation_trailer.CitationTrailerFilter``).
Search never uses this.
"""
from __future__ import annotations

import os
import re
from typing import Optional, Tuple

from . import citation_trailer, query_signals

NEXT_STEP_LABEL = "NEXT_STEP"
KIND_CLARIFY = "clarify"
KIND_FOLLOW_UP = "follow_up"
KIND_NONE = "none"

_NEXT_STEP_RE = re.compile(
    r"(?:[ \t]|\*|_|#|`)*NEXT[_ ]STEP\s*\**\s*[:：][\s*`'\"]*(?P<kind>[A-Za-z_\- ]{0,20})[^\n]*\n?",
    re.IGNORECASE,
)
_QUESTION_MARKS = ("?", "？", "؟")
_QUESTION_TAIL_CHARS = 300
# Intents whose answer is a single fact: never end those with a follow-up question.
_SINGLE_FACT_INTENTS = frozenset({query_signals.INTENT_ATTRIBUTE, query_signals.INTENT_DEFINITION})


def _flag(name: str) -> bool:
    return (os.environ.get(name) or "1").strip().lower() not in ("0", "false", "no", "off")


def clarify_enabled() -> bool:
    return _flag("RAG_CHAT_CLARIFY")


def follow_up_enabled() -> bool:
    return _flag("RAG_CHAT_FOLLOW_UP")


def follow_up_allowed(pq) -> bool:
    """Follow-ups only where useful: not for single-fact or price/number-constrained questions."""
    if not follow_up_enabled():
        return False
    if pq is None:
        return True
    return pq.intent not in _SINGLE_FACT_INTENTS and not pq.has_constraints


def prompt_instruction(*, allow_follow_up: bool) -> str:
    """Chat-mode rules; empty when both features are off."""
    clarify = clarify_enabled()
    if not clarify and not allow_follow_up:
        return ""
    lines = ["CLARIFY OR FOLLOW UP (the question is part of the answer text, before any SOURCES_USED line):"]
    if clarify:
        lines.append(
            "- CLARIFY when the question cannot be answered precisely: it is underspecified, or it "
            "asks for an attribute or ranking (e.g. 'highest rating', 'best battery life') that "
            "DOCUMENTS do not state for the items. Then write one short sentence saying that this "
            "information is not available, give the closest facts DOCUMENTS do state about the "
            "same item or topic, and end with ONE question about the user's request that "
            "offers 2-4 concrete alternatives taken from DOCUMENTS or CONVERSATION HISTORY as plain "
            "text (e.g. 'Would you like me to compare them by price instead, or tell you more about "
            "A or B?'). Never list more than 4 items, never guess, and do not just tell the user to "
            "check elsewhere."
        )
    if allow_follow_up:
        lines.append(
            "- FOLLOW UP when your answer presents several items, products or services, or the "
            "question was broad: end the answer with ONE short question offering 2-4 options taken "
            "from your answer (e.g. 'Which of these would you like to explore further: A, B or C?'). "
            "Never add a follow-up question to a single-fact answer."
        )
    kinds = [k for k, on in ((KIND_CLARIFY, clarify), (KIND_FOLLOW_UP, allow_follow_up)) if on]
    lines.append(
        "- Write that question as a plain sentence of the answer; never put a label such as "
        "'Follow-up:' or 'Clarification:' in front of it."
    )
    lines.append(
        f"- On the very last line (after any SOURCES_USED line) write `{NEXT_STEP_LABEL}:` followed by "
        + " or ".join(f"`{k}`" for k in kinds)
        + f" when the answer ends with such a question, otherwise `{KIND_NONE}`."
    )
    return "\n".join(lines)


def _ends_with_question(answer: str) -> bool:
    tail = (answer or "").rstrip(" \n*_`")[-_QUESTION_TAIL_CHARS:]
    return any(mark in tail for mark in _QUESTION_MARKS)


def chat_instruction(mode: str, pq) -> str:
    """Prompt rules for ``mode`` (always empty outside chat)."""
    if mode != "chat":
        return ""
    return prompt_instruction(allow_follow_up=follow_up_allowed(pq))


def visible_kind(kind: Optional[str], answer: str) -> Optional[str]:
    """``kind`` only when the user-visible answer really ends with a question."""
    if kind in (KIND_CLARIFY, KIND_FOLLOW_UP) and _ends_with_question(answer):
        return kind
    return None


def finalize_meta(retrieval_meta: dict, kind: Optional[str], answer: str, *, mode: str) -> Optional[str]:
    """Record the answer's next step in ``retrieval_meta`` (chat only); returns it."""
    step = visible_kind(kind, answer) if mode == "chat" else None
    if step:
        retrieval_meta["next_step"] = step
    return step


def split_next_step(text: Optional[str]) -> Tuple[str, Optional[str]]:
    """Return (text without the NEXT_STEP line, kind or None)."""
    raw = text or ""
    match = _NEXT_STEP_RE.search(raw)
    if not match:
        return raw, None
    word = (match.group("kind") or "").strip().lower().replace("-", "_").replace(" ", "_")
    kind = next((k for k in (KIND_CLARIFY, KIND_FOLLOW_UP, KIND_NONE) if word.startswith(k)), None)
    head = citation_trailer.restore_closing_emphasis(raw[: match.start()], raw[match.start():])
    cleaned = (head + raw[match.end():]).rstrip()
    return cleaned, kind
