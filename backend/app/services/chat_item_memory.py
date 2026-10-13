"""Item memory for chat follow-ups ("what is its price?", "only the cheapest one").

Stored on the assistant session turn next to the topic memory (``chat_topic_memory``):
``items`` — names of the catalog items the answer presented,
``item_scope`` — the scope of the item question (see ``catalog.followup.Scope``).
The item names also lead the turn's ``entities`` so the follow-up rewriter sees them.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, List, Optional, Sequence, Tuple

from .catalog.followup import Scope
from .catalog.service import (
    asks_about_shown_for,
    followup_queries_for,
    is_scope_wide,
    item_context_for,
    other_items_named_for,
)
from .chat_topic_memory import MEMORY_KEY
from .rag import query_signals
from .rag.item_answers import informs_answer

ITEMS_KEY = "items"
SCOPE_KEY = "item_scope"
_MAX_ITEMS = 5
_SHOWN_ITEMS_MAX_WORDS = 8
_FOLLOWUP_REASONS = frozenset({"contextualized", "followup_unchanged", "reply_resolved", "clarification_reply"})


@dataclass
class ItemResolution:
    context: Any = None
    rag_query: Optional[str] = None
    processed_query: Any = None

    def query_for(self, resolution: Any) -> str:
        return self.rag_query or getattr(resolution, "rag_query", "")

    def processed_for(self, resolution: Any) -> Any:
        return self.processed_query if self.rag_query else getattr(resolution, "processed_query", None)


def _last_assistant(prior_msgs: Sequence[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    for msg in reversed(list(prior_msgs or [])):
        if msg.get("type") == "assistant":
            return msg
    return None


def last_items(prior_msgs: Sequence[Dict[str, Any]]) -> List[str]:
    last = _last_assistant(prior_msgs)
    items = last.get(ITEMS_KEY) if last else None
    return [str(i) for i in items] if isinstance(items, list) else []


def last_scope(prior_msgs: Sequence[Dict[str, Any]]) -> Optional[Scope]:
    last = _last_assistant(prior_msgs)
    return Scope.from_dict(last.get(SCOPE_KEY)) if last else None


def _processed(query: str, language_hint: Optional[str]) -> Any:
    from .rag import query_processing

    if not query_processing.is_enabled():
        return None
    return query_processing.process_query(query, language_hint=language_hint)


def _usable(ctx: Any) -> bool:
    return ctx is not None and bool(ctx.result.rows or ctx.result.closest or ctx.result.brand_counts)


class ItemTurn:
    """Item context of one chat turn.

    ``contextualizer(llm_rewrite)`` answers a follow-up from the remembered item scope
    without the rewrite LLM call when the catalog resolves it; ``resolve(resolution)`` then
    returns the item rows for the turn.
    """

    def __init__(self, db, project_id: Optional[str], prior_msgs: Sequence[Dict[str, Any]], message: str,
                 *, language_hint: Optional[str] = None) -> None:
        self.db, self.project_id, self.message = db, project_id, message
        self.prior_msgs, self.language_hint = prior_msgs, language_hint
        self.scope = last_scope(prior_msgs)
        self._hit: Optional[Tuple[str, Any]] = None
        self._tried_followup = False

    def _followup(self, is_followup: bool) -> Optional[Tuple[str, Any]]:
        if self.scope is None:
            return None
        candidates = followup_queries_for(self.db, self.project_id, self.message, self.scope, is_followup=is_followup)
        for query, relax in candidates:
            ctx = item_context_for(self.db, self.project_id, query, relax_terms=relax)
            if _usable(ctx):
                return query, ctx
        return None

    def continues_items(self) -> bool:
        """A short question about the items the last answer showed, though it names none of
        them ("how many shades are there?"); store questions ("refund time?") are not."""
        text = (self.message or "").strip()
        if self.scope is None or not self.scope.items or len(text.split()) > _SHOWN_ITEMS_MAX_WORDS:
            return False
        if query_signals.store_wide_topic(text):
            return False
        return asks_about_shown_for(self.db, self.project_id, text, self.scope)

    def contextualizer(self, llm_rewrite: Callable[..., Awaitable[Tuple[str, bool]]]):
        async def _rewrite(message: str, history: List[Dict[str, str]], **ctx: Any) -> Tuple[str, bool]:
            self._hit, self._tried_followup = self._followup(is_followup=True), True
            if self._hit is not None:
                return self._hit[0], False
            if self.scope is not None and ctx.get("pending") is None:
                named = other_items_named_for(self.db, self.project_id, self.message, self.scope)
                if named:
                    ctx["named_items"] = named
            return await llm_rewrite(message, history, **ctx)

        return _rewrite

    def resolve(self, resolution: Any) -> ItemResolution:
        """A follow-up first inherits the previous item scope (the rewriter may anchor on an
        older turn); otherwise the resolved query is used. An ambiguous turn the catalog
        answers directly ("realme P4R price?" → not available, closest items) is no longer
        ambiguous."""
        hit = self._hit
        if hit is not None and getattr(resolution, "rag_query", None) == hit[0]:
            return ItemResolution(hit[1])
        is_followup = getattr(resolution, "reason", "") in _FOLLOWUP_REASONS
        hit = None if (is_followup and self._tried_followup) else self._followup(is_followup)
        if hit is not None:
            if getattr(resolution, "is_ambiguous", False):
                resolution.is_ambiguous = False
            return ItemResolution(hit[1], hit[0], _processed(hit[0], self.language_hint))
        query = getattr(resolution, "rag_query", "") or self.message
        if query != self.message and is_scope_wide(self.db, self.project_id, self.message):
            # The rewrite would carry the previous category into a whole-brand or whole-catalog listing.
            own = item_context_for(self.db, self.project_id, self.message)
            if _usable(own):
                return ItemResolution(own, self.message, _processed(self.message, self.language_hint))
        ctx = item_context_for(self.db, self.project_id, query)
        if not _usable(ctx) and query != self.message:
            # The rewrite can carry an anchor the catalog lacks into a self-contained
            # message ("Nokia 3310?" → "mobiles under ₹10,000" became "Nokia phones under …").
            own = item_context_for(self.db, self.project_id, self.message)
            if _usable(own) and (own.result.categories or own.result.brands):
                return ItemResolution(own, self.message, _processed(self.message, self.language_hint))
        if ctx is not None and getattr(resolution, "is_ambiguous", False) and informs_answer(ctx):
            resolution.is_ambiguous = False
        return ItemResolution(ctx)


def resolve_item_context(
    db,
    project_id: Optional[str],
    resolution: Any,
    prior_msgs: Sequence[Dict[str, Any]],
    message: str,
    *,
    language_hint: Optional[str] = None,
) -> ItemResolution:
    return ItemTurn(db, project_id, prior_msgs, message, language_hint=language_hint).resolve(resolution)


def apply_to_turn(turn: Dict[str, Any], item_context: Any) -> None:
    """Remember the presented items and their scope on the assistant turn."""
    if item_context is None:
        return
    scope = Scope.of(item_context.result)
    turn[ITEMS_KEY] = scope.items
    turn[SCOPE_KEY] = scope.to_dict()
    if scope.items:
        short = list(dict.fromkeys(n.split("(")[0].strip() for n in scope.items[:3]))
        entities = [e for e in (turn.get(MEMORY_KEY) or []) if e not in short]
        turn[MEMORY_KEY] = (short + entities)[:8]
