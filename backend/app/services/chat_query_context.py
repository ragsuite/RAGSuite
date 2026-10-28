"""Chat-only query understanding: follow-up resolution, topic memory, ambiguity.

Search never uses this module (no clarification, greeting or entity memory there).
``contextualize_query`` lives in ``chat_contextualize`` (re-exported here and in
``app.routes.rag``); topic memory lives in ``chat_topic_memory``.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple

from .chat_contextualize import (  # noqa: F401 (re-exported)
    _should_stitch_last_turn,
    _stitch_last_turn_facts,
    contextualize_query,
)
from .chat_reply_signals import is_reply
from .chat_unrecognized import is_unrecognized
from .chat_reference_signals import (
    _history_for_chat_answer,
    _is_conversational_followup,
    _message_has_demonstrative_noun,
    _message_has_same_utterance_antecedent,
    is_elliptical_followup,
)
from .chat_topic_memory import (
    LEGACY_CLARIFICATION_TEXT,
    MEMORY_KEY,  # noqa: F401 (re-exported)
    NEXT_STEP_KEY,  # noqa: F401 (re-exported)
    TOPIC_KEY,
    PendingQuestion,
    TopicFrame,
    pending_question,
    resolve_topic_frame,
    subject_entities,
    turn_memory,
)
from .rag import answer_next_step, query_processing
from .rag.query_processing import ProcessedQuery

CLARIFICATION_TEXT = LEGACY_CLARIFICATION_TEXT
_GREETING_RX = re.compile(r"\b(?:hi|hello|hey|greetings)\b", re.IGNORECASE)
_REPLY_REASONS = ("reply_resolved", "reply_ambiguous")


def is_unambiguous_greeting(message: str) -> bool:
    """Short message (≤2 words) containing a whole-word greeting ("hi", not "shipping")."""
    text = (message or "").strip()
    return len(text.split()) <= 2 and bool(_GREETING_RX.search(text))


def build_ambiguity_clarification(user_message: str = "", history: Optional[List[Dict[str, str]]] = None) -> str:
    """Legacy fixed clarification (used when ``RAG_CHAT_CLARIFY`` is off)."""
    return CLARIFICATION_TEXT


@dataclass
class ChatQueryResolution:
    rag_query: str
    is_ambiguous: bool
    processed_query: Optional[ProcessedQuery]
    entities: List[str] = field(default_factory=list)
    reason: str = "standalone"
    contextualize_ms: Optional[int] = None
    topic: TopicFrame = field(default_factory=TopicFrame)
    pending: Optional[PendingQuestion] = None
    translated_from: Optional[str] = None
    translate_ms: Optional[int] = None

    def mark_translated(self, language: Optional[str], ms: Optional[int]) -> None:
        """The message was translated into the content language before resolution."""
        self.translated_from, self.translate_ms = language, ms

    def to_meta(self) -> Dict[str, Any]:
        return {
            "reason": self.reason,
            "entities": list(self.entities),
            "topic": list(self.topic.terms),
            "contextualized": self.reason in ("contextualized", "reply_resolved"),
            "contextualize_ms": self.contextualize_ms,
            "pending_kind": self.pending.kind if self.pending else None,
            "translated_from": self.translated_from,
            "translate_ms": self.translate_ms,
        }

    def answer_history(
        self, message: str, recent_history: List[Dict[str, str]]
    ) -> Optional[List[Dict[str, str]]]:
        """History for answer generation: any follow-up the rewriter handled sees the last
        exchange too ("are you sure?" re-checks the previous answer)."""
        if recent_history and self.reason in ("contextualized", "followup_unchanged"):
            return recent_history[-4:]
        return _history_for_chat_answer(message, recent_history)

    def memory_for_turn(
        self, answer: str, project_id: Optional[str], next_step_kind: Optional[str] = None
    ) -> Dict[str, Any]:
        """Keys stored on the assistant session turn (topic memory + pending question).

        Asking back leaves the question open (``answered: False``). Its original is the
        pending one only while the user was still replying to it; a new question that
        turned out ambiguous starts its own."""
        if self.is_ambiguous:
            memory: Dict[str, Any] = {MEMORY_KEY: []}
            if answer_next_step.clarify_enabled():
                replying = self.pending is not None and self.reason in _REPLY_REASONS
                original = self.pending.original_query if replying else self.rag_query
                memory[NEXT_STEP_KEY] = {
                    "kind": answer_next_step.KIND_CLARIFY, "original_query": original, "answered": False,
                }
            return memory
        if self.reason == "unrecognized":
            # Words nobody uses are no topic: the next message continues the earlier one.
            return {MEMORY_KEY: list(self.topic.entities), TOPIC_KEY: list(self.topic.terms)}
        step = None
        if next_step_kind in (answer_next_step.KIND_CLARIFY, answer_next_step.KIND_FOLLOW_UP):
            step = {"kind": next_step_kind, "original_query": self.rag_query}
        return turn_memory(self.processed_query, self.entities, answer, project_id, next_step=step)


def resolve_entity_memory(prior_msgs: Sequence[Dict[str, Any]], project_id: Optional[str]) -> List[str]:
    """Subject entities of the current topic frame (compat helper)."""
    return list(resolve_topic_frame(prior_msgs, project_id).entities)


def deterministic_ambiguity(pq: Optional[ProcessedQuery], frame: TopicFrame) -> bool:
    """A content-free reference ("is it cheaper?", "which one?") with nothing to refer to."""
    return bool(pq is not None and pq.is_ambiguous_ref and frame.empty)


ContextualizeFn = Callable[..., Awaitable[Tuple[str, bool]]]


def _assistant_texts(history: Sequence[Dict[str, str]]) -> List[str]:
    return [t.get("content") or "" for t in history if t.get("type") == "assistant"]


async def resolve_chat_query(
    message: str,
    prior_msgs: Sequence[Dict[str, Any]],
    recent_history: List[Dict[str, str]],
    *,
    project_id: Optional[str],
    language_hint: Optional[str],
    contextualize: ContextualizeFn,
    continues_items: bool = False,
) -> ChatQueryResolution:
    """Turn a chat message into the retrieval query (or an ambiguity decision).

    ``contextualize(message, history, topic=..., pending=...)`` performs the LLM rewrite.
    ``continues_items``: the catalog found the message asks about the items just shown.
    """
    enabled = query_processing.is_enabled()
    pq = query_processing.process_query(message, language_hint=language_hint) if enabled else None
    frame = resolve_topic_frame(prior_msgs, project_id) if enabled else TopicFrame()
    pending = pending_question(prior_msgs)
    clarify_on = answer_next_step.clarify_enabled()
    elliptical = bool(enabled and recent_history) and (
        continues_items
        or is_elliptical_followup(message, recent_history, named_entities=pq.entities if pq is not None else ())
    )
    rag_query, ambiguous, reason, ctx_ms = message, False, "standalone", None

    t0 = time.perf_counter()
    if enabled and recent_history and is_unrecognized(message, _assistant_texts(recent_history), project_id):
        # Nothing to reply with or follow up on: answered like a first message.
        reason = "unrecognized"
    elif pending is not None and clarify_on and is_reply(message, pending, pq):
        rag_query, ambiguous = await contextualize(message, recent_history, topic=frame, pending=pending)
        ctx_ms = max(0, int((time.perf_counter() - t0) * 1000))
        reason = "reply_ambiguous" if ambiguous else "reply_resolved"
        if ambiguous and pending.kind != answer_next_step.KIND_CLARIFY:
            # Declining or ignoring an offered follow-up is not a reason to ask back.
            rag_query, ambiguous = message, deterministic_ambiguity(pq, frame)
            reason = "deterministic_ambiguity" if ambiguous else "reply_standalone"
    elif (
        pending is not None
        and not clarify_on
        and pending.question == CLARIFICATION_TEXT
        and not (pq is not None and pq.is_ambiguous_ref)
    ):
        rag_query, reason = f"{pending.original_query} regarding {message}", "clarification_reply"
    elif deterministic_ambiguity(pq, frame):
        ambiguous, reason = True, "deterministic_ambiguity"
    elif recent_history and not (
        _message_has_same_utterance_antecedent(message) or _message_has_demonstrative_noun(message)
    ) and (
        _is_conversational_followup(message, recent_history)
        or (pq is not None and pq.is_ambiguous_ref)
        or elliptical
    ):
        context: Dict[str, Any] = {"topic": frame}
        if elliptical:
            context["elliptical"] = True
        rag_query, ambiguous = await contextualize(message, recent_history, **context)
        ctx_ms = max(0, int((time.perf_counter() - t0) * 1000))
        if ambiguous:
            reason = "llm_ambiguity"
        else:
            reason = "contextualized" if rag_query != message else "followup_unchanged"

    if (
        not ambiguous
        and recent_history
        and reason == "standalone"
        and _should_stitch_last_turn(message, recent_history, elliptical=False)
    ):
        stitched = _stitch_last_turn_facts(rag_query, recent_history, message)
        if stitched != rag_query:
            rag_query = stitched
            reason = "followup_unchanged"

    final_pq = pq
    if enabled and not ambiguous and rag_query != message:
        final_pq = query_processing.process_query(rag_query, language_hint=language_hint)
    entities = subject_entities(final_pq.entities, project_id) if final_pq is not None else []
    if not entities and reason in ("contextualized", "followup_unchanged", "clarification_reply", "reply_resolved"):
        entities = list(frame.entities)
    return ChatQueryResolution(
        rag_query=rag_query,
        is_ambiguous=ambiguous,
        processed_query=final_pq,
        entities=entities,
        reason=reason,
        contextualize_ms=ctx_ms,
        topic=frame,
        pending=pending,
    )
