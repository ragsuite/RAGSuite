"""What a chat conversation is currently about (topic frame) and pending assistant questions.

Stored on assistant session turns (Redis session JSON, no schema):
``entities`` — subject entities from the question and the answer,
``topic`` — content terms of the resolved question,
``next_step`` — ``{"kind": "clarify"|"follow_up", "original_query": ..., "answered": bool}``
when the assistant ended its turn with a question; ``answered`` is false when it asked
back instead of answering (the original question is still open).
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .chat_reference_signals import CONVERSATIONAL_TERMS, _extract_entities_from_text
from .rag import query_processing, source_routing
from .rag.query_processing import ProcessedQuery

LEGACY_CLARIFICATION_TEXT = (
    "Could you clarify who or what you're referring to? I want to make sure I give you the right answer."
)
MEMORY_KEY = "entities"
TOPIC_KEY = "topic"
NEXT_STEP_KEY = "next_step"
QUESTION_KINDS = ("clarify", "follow_up")

_MAX_MEMORY = 8
_MAX_TOPIC_TERMS = 6
_MAX_ANSWER_ENTITIES = 6
_MAX_QUESTION_CHARS = 400
_QUESTION_MARKS = ("?", "？", "؟")
# Site navigation words never identify what a follow-up refers to.
_NAVIGATION_TERMS = frozenset(
    """
    faq faqs help center centre contact contacts page pages website site app account login
    careers career support service services customer customers team about home shop store
    """.split()
)
_BOLD_RX = re.compile(r"\*\*([^*\n]{2,80})\*\*")
_WORD_RX = re.compile(r"[^\W\d_]{3,}", re.UNICODE)
_NAME_WORD_RX = re.compile(r"[^\W\d_]{2,}", re.UNICODE)
# Bold label opening a top-level list item: "- **Prepaid gift cards** (…)", "1. **Plan A**:".
_LIST_ITEM_RX = re.compile(r"^(?:[-*•]|\d{1,2}[.)])\s+\*\*([^*\n]{2,60})\*\*", re.MULTILINE)


@dataclass(frozen=True)
class TopicFrame:
    entities: Tuple[str, ...] = ()
    terms: Tuple[str, ...] = ()

    @property
    def empty(self) -> bool:
        return not self.entities and not self.terms

    def describe(self) -> str:
        parts = []
        if self.entities:
            parts.append("entities: " + ", ".join(self.entities))
        if self.terms:
            parts.append("topic: " + ", ".join(self.terms))
        return "; ".join(parts)


@dataclass(frozen=True)
class PendingQuestion:
    kind: str
    question: str
    original_query: str
    answered: bool = True


def _subject_words(entity: str, project_id: Optional[str]) -> List[str]:
    """Words of ``entity`` that name a subject (not a site/source name or navigation word)."""
    out: List[str] = []
    for word in (entity or "").lower().split():
        if (
            word in _NAVIGATION_TERMS
            or word in CONVERSATIONAL_TERMS
            or word in query_processing._GENERIC_TERMS
        ):
            continue
        if project_id and source_routing.match_source_ids(project_id, word):
            continue
        out.append(word)
    return out


def _collapse_nested(entities: Sequence[str]) -> List[str]:
    """Drop entities contained in a longer one ("S24" inside "Galaxy S24") — same referent."""
    lowered = [e.lower() for e in entities]
    out: List[str] = []
    seen: Set[str] = set()
    for entity, low in zip(entities, lowered):
        if low in seen or any(len(o) > len(low) and f" {low} " in f" {o} " for o in lowered):
            continue
        seen.add(low)
        out.append(entity)
    return out


def subject_entities(entities: Sequence[str], project_id: Optional[str]) -> List[str]:
    subjects = [e for e in entities if _subject_words(e, project_id)]
    return _collapse_nested(subjects)[:_MAX_MEMORY]


def _looks_like_name(span: str) -> bool:
    """"ASUS laptops", "PaysafeCard", "Lenovo 100e Chromebook" — not "specific ratings",
    "With registration" or "GBP 40–1,000"."""
    words = span.split()
    alpha = [w for w in words if _NAME_WORD_RX.search(w)]
    if not alpha or len(words) > 8 or words[0][:1].isdigit():
        return False
    if any(ch.isdigit() for ch in span) and len(alpha) < 2:
        return False
    if len(alpha) >= 2 and all(w.isupper() and len(w) <= 3 for w in alpha):
        return False  # units/spec abbreviations: "GB RAM", "TB SSD"
    if not any(ch.isupper() or ch.islower() for ch in span):
        return True  # scripts without letter case (e.g. Chinese, Arabic)
    first = words[0]
    if (first.isupper() and len(first) > 1) or any(ch.isupper() for ch in first[1:]):
        return True
    if len(words) == 1:
        return first[:1].isupper()
    return any(w[:1].isupper() for w in words[1:])


def answer_entities(answer: str) -> List[str]:
    """Named things an answer presents: top-level list items, bold names and multi-word
    capitalized names."""
    found: List[str] = []
    for match in _LIST_ITEM_RX.finditer(answer or ""):
        item = match.group(1).strip(" :.-")
        if _NAME_WORD_RX.search(item) and not item[:1].isdigit():
            found.append(item)
    for match in _BOLD_RX.finditer(answer or ""):
        for span in match.group(1).split(","):
            span = span.strip(" :.-")
            if _looks_like_name(span):
                found.append(span)
    for name in _extract_entities_from_text(answer or ""):
        if " " in name and _looks_like_name(name):
            found.append(name)
    return _collapse_nested(found)[:_MAX_ANSWER_ENTITIES]


def topic_terms(pq: Optional[ProcessedQuery], project_id: Optional[str]) -> List[str]:
    if pq is None:
        return []
    terms = [t for t in pq.content_terms if _subject_words(t, project_id)]
    return list(dict.fromkeys(terms))[:_MAX_TOPIC_TERMS]


def turn_memory(
    pq: Optional[ProcessedQuery],
    question_entities: Sequence[str],
    answer: str,
    project_id: Optional[str],
    *,
    next_step: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Keys to store on the assistant session turn."""
    entities = subject_entities(list(question_entities) + answer_entities(answer), project_id)
    memory: Dict[str, Any] = {MEMORY_KEY: entities, TOPIC_KEY: topic_terms(pq, project_id)}
    if next_step and next_step.get("kind") in QUESTION_KINDS:
        memory[NEXT_STEP_KEY] = next_step
    return memory


def resolve_topic_frame(prior_msgs: Sequence[Dict[str, Any]], project_id: Optional[str]) -> TopicFrame:
    """Topic of the most recent exchange: stored on the assistant turn, else parsed from the
    last user turn. The legacy fixed clarification resets it."""
    for msg in reversed(list(prior_msgs or [])):
        kind = msg.get("type")
        content = (msg.get("content") or "").strip()
        if kind == "assistant":
            if content == LEGACY_CLARIFICATION_TEXT:
                return TopicFrame()
            stored = msg.get(MEMORY_KEY)
            if isinstance(stored, list):
                terms = msg.get(TOPIC_KEY) if isinstance(msg.get(TOPIC_KEY), list) else []
                return TopicFrame(
                    tuple(subject_entities([str(e) for e in stored], project_id)),
                    tuple(str(t) for t in terms),
                )
        elif kind == "user" and content:
            pq = query_processing.process_query(content)
            return TopicFrame(
                tuple(subject_entities(pq.entities, project_id)),
                tuple(topic_terms(pq, project_id)),
            )
    return TopicFrame()


def _trailing_question(content: str) -> str:
    """The last line(s) of an answer that hold its closing question (the whole text if short)."""
    if len(content) <= _MAX_QUESTION_CHARS:
        return content
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    for i in range(len(lines) - 1, -1, -1):
        if any(mark in lines[i] for mark in _QUESTION_MARKS):
            return " ".join(lines[i:])[-_MAX_QUESTION_CHARS:]
    return content[-_MAX_QUESTION_CHARS:]


def pending_question(prior_msgs: Sequence[Dict[str, Any]]) -> Optional[PendingQuestion]:
    """The question the assistant ended its last turn with, if any."""
    msgs = list(prior_msgs or [])
    if not msgs or msgs[-1].get("type") != "assistant":
        return None
    last = msgs[-1]
    content = (last.get("content") or "").strip()
    step = last.get(NEXT_STEP_KEY)
    previous_user = next(
        (m.get("content") or "" for m in reversed(msgs[:-1]) if m.get("type") == "user"), ""
    )
    if isinstance(step, dict) and step.get("kind") in QUESTION_KINDS:
        original = str(step.get("original_query") or previous_user)
        answered = step.get("answered")
        if not isinstance(answered, bool):
            # Stored before ``answered`` existed: asking back never stored topic terms.
            answered = step["kind"] != "clarify" or TOPIC_KEY in last
        return PendingQuestion(str(step["kind"]), _trailing_question(content), original, answered)
    if content == LEGACY_CLARIFICATION_TEXT:
        return PendingQuestion("clarify", content, previous_user, answered=False)
    return None
