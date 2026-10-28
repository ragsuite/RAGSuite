"""LLM rewrite of a chat message into a standalone retrieval question.

Two modes: a follow-up with a vague reference (resolved against the topic frame), and a
reply to a question the assistant asked (folded into the original question).
Prompts live in ``chat_rewrite_prompts``.
"""
from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from .chat_reference_signals import (
    _AMBIGUOUS_REF_RE,
    CONVERSATIONAL_TERMS,
    _content_tokens,
    _extract_entities_from_text,
    _extract_salient_entities,
    _fold_plural,
    _has_multiple_referent_candidates,
    _is_topic_shift,
    _llm_marked_ambiguous,
    _message_has_ambiguous_reference,
    _message_has_demonstrative_noun,
    _message_has_same_utterance_antecedent,
    _message_names_explicit_entity,
    _message_has_plural_collective_reference,
)
from .chat_reply_signals import accepts_offer
from .chat_rewrite_prompts import HISTORY_TURNS as _HISTORY_TURNS
from .chat_rewrite_prompts import followup_prompt as _followup_prompt
from .chat_rewrite_prompts import keep_words_note as _keep_words_note
from .chat_rewrite_prompts import reply_prompt as _reply_prompt
from .chat_topic_memory import PendingQuestion, TopicFrame
from .rag import answer_next_step, query_processing, query_signals

logger = logging.getLogger(__name__)

_TIMEOUT_S = 10.0
_MARKUP_RX = re.compile(r"\*\*|__|`")
_NUMBER_RX = re.compile(r"\d+(?:[.,]\d+)*")
_MONTHS = (
    "January|February|March|April|May|June|July|August|September|October|November|December"
)
_MONTH_NAMES = frozenset(m.lower() for m in _MONTHS.split("|"))
_DATE_RX = re.compile(
    rf"\b(?:\d{{1,2}}\s+(?:{_MONTHS})\s+\d{{4}}|(?:{_MONTHS})\s+\d{{1,2}},?\s+\d{{4}})\b",
    re.IGNORECASE,
)
_UNIT = r"kg|km|cm|mm|mg|g|t|lb|lbs|%|°C|°F|hours?|hrs?|days?|years?|minutes?|mins?|seconds?|secs?"
_QUANTITY_RX = re.compile(
    rf"\b(?:\d+(?:[.,]\d+)?\s*(?:{_UNIT})|\d{{2,}}(?:[.,]\d+)?)\b",
    re.IGNORECASE,
)
_QUANTITY_ATTRIBUTE_RX = re.compile(
    r"\b(?:mass|weight|weigh|date|when|duration|how\s+long|how\s+much|how\s+many|"
    r"how\s+heavy|size|height|length|width|altitude|payload|speed|temperature|"
    r"year|month|launch|kg|km)\b",
    re.IGNORECASE,
)
_STITCH_MAX_WORDS = 12
_STITCH_MAX_QUANTITIES = 4
# A short follow-up naming a full product title ("HP 250 G9 Intel Celeron … (8 GB/256 GB
# SSD/Windows 11 Home)") legitimately grows long; only rambling output goes beyond this.
_MIN_REWRITE_CAP = 300
_LAST_EXCHANGE_TURNS = 2
# "the lash mob one": a pro-form standing for the item the rewrite names.
_PRO_FORMS = frozenset({"one", "ones"})


def _word_kept(word: str, rewrite_tokens: Set[str]) -> bool:
    stem = _fold_plural(word)[:5]
    return any(_fold_plural(token).startswith(stem) for token in rewrite_tokens)


def _dropped_user_words(user_message: str, rewrite: str) -> List[str]:
    """Words and numbers the user typed (not fillers or confirmation tags) that the rewrite
    lost ("die 1500er Rechts-Version" rewritten with the 800 from the history)."""
    rewrite_tokens = _content_tokens(rewrite)
    words = sorted(
        word for word in _content_tokens(user_message) - CONVERSATIONAL_TERMS - _PRO_FORMS
        if not _word_kept(word, rewrite_tokens)
    )
    rewrite_numbers = set(_NUMBER_RX.findall(rewrite))
    numbers = sorted(set(_NUMBER_RX.findall(user_message)) - rewrite_numbers)
    return words + numbers


def _last_exchange_texts(history: List[Dict[str, str]]) -> Tuple[str, str]:
    """Most recent user and assistant contents (either side may be empty)."""
    user, assistant = "", ""
    for turn in reversed(history):
        kind = turn.get("type")
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        if kind == "assistant" and not assistant:
            assistant = content
        elif kind == "user" and not user:
            user = content
        if user and assistant:
            break
    return user, assistant


def _last_turn_facts(history: List[Dict[str, str]]) -> Tuple[Optional[str], List[str]]:
    """Last named entity and quantity/date tokens from the last exchange."""
    user, assistant = _last_exchange_texts(history)
    def _entities(text: str) -> List[str]:
        return [
            token
            for token in _extract_entities_from_text(text)
            if token.lower() not in _MONTH_NAMES
        ]

    entities = _entities(assistant) or _entities(user)
    entity = entities[0] if entities else None
    quantities: List[str] = []
    seen: Set[str] = set()
    for blob in (assistant, user):
        for match in _DATE_RX.finditer(blob):
            token = " ".join(match.group(0).split())
            key = token.lower()
            if key not in seen:
                seen.add(key)
                quantities.append(token)
        for match in _QUANTITY_RX.finditer(blob):
            token = " ".join(match.group(0).split())
            key = token.lower()
            if key in seen or any(key in prior.lower() for prior in quantities):
                continue
            seen.add(key)
            quantities.append(token)
    return entity, quantities[:_STITCH_MAX_QUANTITIES]


def _should_stitch_last_turn(
    user_message: str,
    history: List[Dict[str, str]],
    *,
    elliptical: bool = False,
) -> bool:
    """True for a short follow-up that still depends on the last answer's entity/numbers."""
    if not history or not (user_message or "").strip():
        return False
    if len(user_message.split()) > _STITCH_MAX_WORDS:
        return False
    if _message_has_same_utterance_antecedent(user_message) or _message_has_demonstrative_noun(
        user_message
    ):
        return False
    if _message_names_explicit_entity(user_message) and not _message_has_ambiguous_reference(
        user_message
    ):
        return False
    if elliptical or _message_has_ambiguous_reference(user_message):
        return True
    if _QUANTITY_ATTRIBUTE_RX.search(user_message):
        return True
    msg_tokens = _content_tokens(user_message) - CONVERSATIONAL_TERMS
    if not msg_tokens:
        return False
    if _is_topic_shift(user_message, history) and not _QUANTITY_ATTRIBUTE_RX.search(user_message):
        return False
    last_tokens = _tokens_of(history[-_LAST_EXCHANGE_TURNS:])
    return bool(msg_tokens & last_tokens)


def _stitch_last_turn_facts(
    query: str,
    history: List[Dict[str, str]],
    user_message: str,
    *,
    include_entity: bool = True,
) -> str:
    """Append last-turn entity (and quantities when the follow-up asks for them) for retrieval."""
    entity, quantities = _last_turn_facts(history)
    lowered = (query or "").lower()
    extra: List[str] = []
    if include_entity and entity and entity.lower() not in lowered:
        extra.append(entity)
    if _QUANTITY_ATTRIBUTE_RX.search(user_message):
        for token in quantities:
            if token.lower() not in lowered:
                extra.append(token)
    if not extra:
        return query
    return f"{(query or '').rstrip()} {' '.join(extra)}".strip()


def _with_stitch(
    user_message: str,
    query: str,
    history: List[Dict[str, str]],
    ambiguous: bool,
    *,
    elliptical: bool = False,
    include_entity: bool = True,
) -> Tuple[str, bool]:
    if ambiguous or not history:
        return query, ambiguous
    if not _should_stitch_last_turn(user_message, history, elliptical=elliptical):
        return query, False
    return _stitch_last_turn_facts(
        query, history, user_message, include_entity=include_entity
    ), False


def _clean_rewrite(text: str) -> str:
    """Markdown emphasis copied from the history is noise in a retrieval query."""
    return _MARKUP_RX.sub("", text or "").strip().strip("\"'").strip()


async def _complete(prompt: str, llm_config: Optional[Dict[str, Any]], llm_factory: Any) -> str:
    provider = (llm_config or {}).get("provider", "openai")
    model = (llm_config or {}).get("chat_model", "gpt-4")
    api_key = (llm_config or {}).get("api_key")
    llm = llm_factory.get_llm(provider, model, api_key)
    loop = asyncio.get_running_loop()
    result = await asyncio.wait_for(
        loop.run_in_executor(None, lambda: llm.complete(prompt)), timeout=_TIMEOUT_S
    )
    return (result.text if hasattr(result, "text") else str(result)).strip()


def _tokens_of(turns: List[Dict[str, str]]) -> Set[str]:
    out: Set[str] = set()
    for turn in turns:
        out |= _content_tokens(turn.get("content") or "")
    return out


def _is_history_graft(user_message: str, result_text: str, history: List[Dict[str, str]]) -> bool:
    """A rewrite that only grafts prior-turn words onto a self-contained new question."""
    msg_tokens = _content_tokens(user_message) - CONVERSATIONAL_TERMS
    history_tokens = _tokens_of(history[-_HISTORY_TURNS:])
    rewritten_extra = _content_tokens(result_text) - msg_tokens
    return bool(
        len(msg_tokens) >= 2
        and rewritten_extra
        and rewritten_extra.issubset(history_tokens)
        and not (msg_tokens & history_tokens)
    )


def _is_stale_graft(user_message: str, result_text: str, history: List[Dict[str, str]]) -> bool:
    """The rewrite adds words of an earlier user question that the last exchange no longer
    mentions ("and delivery time" after a shipping question became "delivery time for
    mascara" from two turns back), while the message neither names nor points back to
    anything from that question. Assistant wording (site names, boilerplate) is ignored."""
    window = history[-_HISTORY_TURNS:]
    if len(window) <= _LAST_EXCHANGE_TURNS or _AMBIGUOUS_REF_RE.search(user_message):
        return False
    last = _tokens_of(window[-_LAST_EXCHANGE_TURNS:])
    older_user = [t for t in window[:-_LAST_EXCHANGE_TURNS] if t.get("type") == "user"]
    older_only = _tokens_of(older_user) - last
    msg_tokens = _content_tokens(user_message)
    added = _content_tokens(result_text) - msg_tokens
    return bool(added & older_only) and not (msg_tokens & older_only)


async def resolve_reply(
    user_message: str,
    history: List[Dict[str, str]],
    llm_config: Optional[Dict[str, Any]],
    *,
    llm_factory: Any,
    pending: PendingQuestion,
) -> Tuple[str, bool]:
    """Fold a reply to the assistant's question into the original request. Accepting an
    offered follow-up ("yes") asks what the assistant offered."""
    if pending.kind == answer_next_step.KIND_FOLLOW_UP and accepts_offer(user_message):
        fallback = pending.question
    else:
        fallback = f"{pending.original_query} {user_message}".strip()
    try:
        result_text = _clean_rewrite(await _complete(_reply_prompt(user_message, history, pending), llm_config, llm_factory))
    except asyncio.TimeoutError:
        logger.warning("Reply contextualization timed out, combining with original question")
        return fallback, False
    except Exception as exc:
        logger.warning("Reply contextualization failed, combining with original question: %s", exc)
        return fallback, False
    if _llm_marked_ambiguous(result_text):
        return user_message, True
    if not result_text or len(result_text) > max(len(fallback) * 4, 200):
        return fallback, False
    logger.info("Reply contextualized: %r -> %r", user_message[:80], result_text[:120])
    return result_text, False


async def contextualize_query(
    user_message: str,
    history: List[Dict[str, str]],
    llm_config: Optional[Dict[str, Any]],
    *,
    llm_factory: Any,
    topic: Optional[TopicFrame] = None,
    pending: Optional[PendingQuestion] = None,
    elliptical: bool = False,
    named_items: Sequence[str] = (),
) -> Tuple[str, bool]:
    """Rewrite user_message as a standalone question using conversation history.

    Fast path (no referential language or empty history): returns original query unchanged.
    With ``pending`` the message is treated as a reply to the assistant's question.
    ``elliptical`` marks a short subject-less continuation ("are you sure?", "any other
    brands?") that has no pronoun but still depends on the last exchange.
    ``named_items``: catalog items the message names in part ("n the stroke of genius one?").
    Returns (standalone_query, is_ambiguous).
    """
    if pending is not None:
        return await resolve_reply(
            user_message, history, llm_config, llm_factory=llm_factory, pending=pending
        )
    if not history or not (elliptical or _message_has_ambiguous_reference(user_message)):
        return _with_stitch(user_message, user_message, history, False, elliptical=elliptical)

    # "What about the cheaper one?" names no subject of its own: it can only mean the topic.
    refers_to_topic = bool(
        topic is not None and not topic.empty and query_processing.process_query(user_message).is_ambiguous_ref
    )
    # New topical question with little overlap to prior turns — do not graft old entities.
    if not refers_to_topic and not elliptical and _is_topic_shift(user_message, history):
        logger.info("Contextualize skipped (topic shift): keeping original query %r", user_message[:120])
        return _with_stitch(user_message, user_message, history, False, elliptical=elliptical)

    if (
        not elliptical
        and _has_multiple_referent_candidates(history)
        and not _message_has_plural_collective_reference(user_message)
    ):
        logger.info(
            "Referent ambiguity precheck: %d salient entities in recent history",
            len(_extract_salient_entities(history)),
        )
        return user_message, True

    try:
        result_text = await _rewrite_followup(user_message, history, topic, named_items, llm_config, llm_factory)
    except asyncio.TimeoutError:
        logger.warning("Query contextualization timed out, using original query")
        return user_message, False
    except Exception as exc:
        logger.warning(f"Query contextualization failed, using original query: {exc}")
        return user_message, False
    if _llm_marked_ambiguous(result_text):
        return user_message, True
    if not _fits(user_message, result_text):
        return user_message, False
    if not refers_to_topic and not elliptical and _is_history_graft(user_message, result_text, history):
        logger.info("Contextualize rejected history graft onto new topic: %r -> %r", user_message[:80], result_text[:80])
        return user_message, False
    if _grafts_onto_store_question(user_message, result_text, history):
        logger.info("Contextualize rejected item graft onto a store question: %r -> %r", user_message[:80], result_text[:80])
        result_text = await _rewrite_again(user_message, [], history, named_items, llm_config, llm_factory)
    elif not refers_to_topic and _is_stale_graft(user_message, result_text, history):
        logger.info("Contextualize rejected graft from an older turn: %r -> %r", user_message[:80], result_text[:80])
        last = history[-_LAST_EXCHANGE_TURNS:]
        result_text = await _rewrite_again(user_message, last, history, named_items, llm_config, llm_factory)
    if not result_text:
        return user_message, False
    logger.info(f"Query contextualized: '{user_message}' -> '{result_text}'")
    return _with_stitch(
        user_message, result_text, history, False, elliptical=elliptical, include_entity=False
    )


def _grafts_onto_store_question(user_message: str, result_text: str, history: List[Dict[str, str]]) -> bool:
    """A store-wide question ("ok n delivery time?") that the rewrite tied to words of an
    earlier user question (the concealer just discussed). "can I return it?" points back."""
    if _AMBIGUOUS_REF_RE.search(user_message) or not query_signals.store_wide_topic(user_message):
        return False
    msg_tokens = _content_tokens(user_message)
    user_turns = [t for t in history[-_HISTORY_TURNS:] if t.get("type") == "user"]
    added = _content_tokens(result_text) - msg_tokens
    return bool(added & (_tokens_of(user_turns) - msg_tokens))


def _fits(user_message: str, result_text: str) -> bool:
    return bool(result_text) and len(result_text) <= max(len(user_message) * 6, _MIN_REWRITE_CAP)


async def _rewrite_followup(
    user_message: str,
    history: List[Dict[str, str]],
    topic: Optional[TopicFrame],
    named_items: Sequence[str],
    llm_config: Optional[Dict[str, Any]],
    llm_factory: Any,
) -> str:
    """One follow-up rewrite; asks once more when it lost words the user typed, keeping the
    retry only when it loses fewer of them."""
    prompt = _followup_prompt(user_message, history, topic, named_items)
    result_text = _clean_rewrite(await _complete(prompt, llm_config, llm_factory))
    if _llm_marked_ambiguous(result_text):
        return result_text
    dropped = _dropped_user_words(user_message, result_text) if result_text else []
    if not dropped:
        return result_text
    logger.info("Contextualize rewrite %r dropped %s; asking once more", result_text[:120], dropped)
    try:
        retry = _clean_rewrite(await _complete(prompt + _keep_words_note(result_text, dropped), llm_config, llm_factory))
    except Exception as exc:
        logger.warning("Contextualize retry failed, keeping first rewrite: %s", exc)
        return result_text
    if retry and not _llm_marked_ambiguous(retry) and len(_dropped_user_words(user_message, retry)) < len(dropped):
        return retry
    return result_text


async def _rewrite_again(
    user_message: str,
    turns: List[Dict[str, str]],
    history: List[Dict[str, str]],
    named_items: Sequence[str],
    llm_config: Optional[Dict[str, Any]],
    llm_factory: Any,
) -> str:
    """Rewrite again from fewer ``turns`` after the first rewrite grafted a subject: the last
    exchange ("used once tho" after a returns answer) or none (a store question); "" when the
    retry grafts too. The topic frame is left out: it carries the grafted subject."""
    try:
        result_text = await _rewrite_followup(user_message, turns, None, named_items, llm_config, llm_factory)
    except Exception as exc:
        logger.warning("Contextualize second rewrite failed, using original query: %s", exc)
        return ""
    if _llm_marked_ambiguous(result_text) or not _fits(user_message, result_text):
        return ""
    if _is_stale_graft(user_message, result_text, history) or _grafts_onto_store_question(user_message, result_text, history):
        return ""
    return result_text
