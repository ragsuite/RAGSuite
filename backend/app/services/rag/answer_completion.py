"""Chat answers that end cleanly instead of stopping mid-list at the token cap.

Three layers, chat mode only (Search keeps its own prompts and budgets):
1. Prompt: a length budget and a short closing sentence (mirrors Search's closing paragraph).
2. Provider hard cap = configured budget + a small reserve, so the model can finish.
3. Safety net when the provider still stops at the cap: trim the dangling tail and append one
   LLM-written closing sentence (tiny bounded call; trim only on failure or timeout).
"""
from __future__ import annotations

import copy
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any, Dict, Optional, Tuple

from ..chat_token_budget import CHAT_MAX_TOKENS_CEILING
from .answer_tail_trim import TERMINAL_CHARS, trim_incomplete_tail

logger = logging.getLogger(__name__)

_RESERVE_RATIO = 0.25
_RESERVE_MIN = 64
_RESERVE_MAX = 300
_WORDS_PER_BUDGET_TOKEN = 0.45
_CLOSING_MAX_TOKENS = 60
_CLOSING_TEMPERATURE = 0.3
_CLOSING_TAIL_CHARS = 1200
_CLOSING_MIN_CHARS = 10
_CLOSING_MAX_CHARS = 220

_LENGTH_REASONS = frozenset({"length", "max_tokens", "model_length"})
_PREAMBLE_RE = re.compile(
    r"^(?:here(?:'|’)?s|here is|sure|okay|ok)\b[^:\n]{0,80}:\s*", re.IGNORECASE
)
_DIGITS_RE = re.compile(r"\d+")
_FORBIDDEN_IN_CLOSING = ("SOURCES_USED", "NEXT_STEP", "QUERY_OUT_OF_CONTEXT", "```")

_FINISH_REASON_PATHS: Tuple[Tuple[Any, ...], ...] = (
    ("finish_reason",),
    ("done_reason",),
    ("stop_reason",),
    ("choices", 0, "finish_reason"),
    ("data", "choices", 0, "finish_reason"),
    ("candidates", 0, "finish_reason"),
)

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="chat-closing")


def enabled() -> bool:
    return (os.environ.get("RAG_CHAT_ANSWER_COMPLETION") or "1").strip().lower() not in (
        "0", "false", "no", "off",
    )


def _closing_timeout_s() -> float:
    try:
        return max(0.5, float(os.environ.get("RAG_CHAT_CLOSING_TIMEOUT_S") or 4))
    except ValueError:
        return 4.0


def applies(mode: str, format_type: Optional[str]) -> bool:
    return enabled() and mode == "chat" and not (format_type or "").startswith("html")


def hard_cap(budget: int) -> int:
    """Provider cap for a chat answer whose visible target is ``budget`` tokens."""
    if not budget or budget <= 0:
        return budget
    reserve = min(_RESERVE_MAX, max(_RESERVE_MIN, round(budget * _RESERVE_RATIO)))
    return min(budget + reserve, max(budget, CHAT_MAX_TOKENS_CEILING))


def chat_instruction(mode: str, format_type: Optional[str], budget: Optional[int]) -> str:
    """Length + ending rules for chat markdown answers; empty everywhere else."""
    if not applies(mode, format_type) or not budget or budget <= 0:
        return ""
    words = max(80, int(round(budget * _WORDS_PER_BUDGET_TOKEN / 10.0)) * 10)
    return (
        f"LENGTH: Keep the whole answer within about {words} words. If many items match, present "
        "the most relevant ones briefly (one or two short lines each) instead of listing "
        "everything, so the answer is never cut off.\n"
        "ENDING: When the answer contains a list or several sections, finish it with one short, "
        "complete closing sentence in plain prose that wraps it up (no heading, no 'Summary' "
        "label, no new facts). Any follow-up question comes after that sentence."
    )


def _step(obj: Any, key: Any) -> Any:
    if obj is None:
        return None
    if isinstance(key, int):
        return obj[key] if isinstance(obj, (list, tuple)) and len(obj) > key else None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def finish_reason(raw: Any) -> Optional[str]:
    """Provider stop reason (lower-case) from a llama-index ``raw`` payload, if present."""
    for path in _FINISH_REASON_PATHS:
        cur = raw
        for key in path:
            cur = _step(cur, key)
            if cur is None:
                break
        if cur is None or cur == "" or isinstance(cur, (int, float)):
            continue
        value = getattr(cur, "value", None)
        name = value if isinstance(value, str) else getattr(cur, "name", None)
        return str(name if isinstance(name, str) else cur).strip().lower()
    return None


def was_truncated(raw: Any, completion_tokens: Optional[int], cap: Optional[int]) -> bool:
    reason = finish_reason(raw)
    if reason in _LENGTH_REASONS:
        return True
    try:
        return bool(cap and completion_tokens and int(completion_tokens) >= int(cap))
    except (TypeError, ValueError):
        return False


def _closing_prompt(user_query: str, answer: str) -> str:
    tail = answer[-_CLOSING_TAIL_CHARS:]
    return (
        "You are finishing a chatbot answer that had to stop early because of its length.\n"
        f"QUESTION: {user_query.strip()}\n"
        f"ANSWER (end of it):\n{tail}\n\n"
        "Write exactly ONE short, complete closing sentence (at most 30 words) that wraps up this "
        "answer for the user, in the same language as the ANSWER. Do not add new facts, numbers, "
        "names or prices. No markdown, no quotes, no heading, no label. Reply with the sentence "
        "itself only — no introduction such as 'Here is a closing sentence:'."
    )


def _closing_kwargs(llm_kwargs: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    kwargs = copy.deepcopy(llm_kwargs or {})
    if isinstance(kwargs.get("generation_config"), dict):
        kwargs["generation_config"]["max_output_tokens"] = _CLOSING_MAX_TOKENS
        kwargs["generation_config"]["temperature"] = _CLOSING_TEMPERATURE
    else:
        kwargs["max_tokens"] = _CLOSING_MAX_TOKENS
        kwargs["temperature"] = _CLOSING_TEMPERATURE
    return kwargs


def clean_closing(candidate: Optional[str], answer: str) -> Optional[str]:
    """Validated single closing sentence, or ``None`` when the output is unusable."""
    lines = [line.strip() for line in (candidate or "").splitlines() if line.strip()]
    if len(lines) == 2 and lines[0].rstrip("*_ ").endswith(":"):
        lines = lines[1:]
    if len(lines) != 1:
        return None
    text = _PREAMBLE_RE.sub("", lines[0]).strip("\"'“”‘’*_#> \t").strip()
    if not (_CLOSING_MIN_CHARS <= len(text) <= _CLOSING_MAX_CHARS):
        return None
    if text[-1] not in TERMINAL_CHARS or any(tok in text for tok in _FORBIDDEN_IN_CLOSING):
        return None
    if any(d not in answer for d in _DIGITS_RE.findall(text)):
        return None
    return text


def closing_sentence(
    llm: Any,
    *,
    user_query: str,
    answer: str,
    llm_kwargs: Optional[Dict[str, Any]] = None,
    timeout_s: Optional[float] = None,
) -> Optional[str]:
    if llm is None or not answer.strip():
        return None
    prompt = _closing_prompt(user_query or "", answer)
    kwargs = _closing_kwargs(llm_kwargs)
    future = _executor.submit(lambda: getattr(llm.complete(prompt, **kwargs), "text", "") or "")
    try:
        raw = future.result(timeout=timeout_s if timeout_s is not None else _closing_timeout_s())
    except FutureTimeout:
        logger.warning("chat closing sentence timed out — keeping trimmed answer")
        return None
    except Exception as exc:  # noqa: BLE001 - provider errors must never break the answer
        logger.warning("chat closing sentence failed: %s", exc)
        return None
    return clean_closing(raw, answer)


def complete_truncated(
    text: str,
    *,
    llm: Any,
    user_query: str,
    llm_kwargs: Optional[Dict[str, Any]] = None,
    timeout_s: Optional[float] = None,
) -> Tuple[str, Dict[str, Any]]:
    """Trim a cut-off answer and close it; returns (answer, meta for retrieval_meta)."""
    trimmed = trim_incomplete_tail(text)
    closing = None
    if trimmed.strip():
        closing = closing_sentence(
            llm, user_query=user_query, answer=trimmed, llm_kwargs=llm_kwargs, timeout_s=timeout_s
        )
    result = f"{trimmed}\n\n{closing}" if closing else trimmed
    return result, {"truncated": True, "closing": bool(closing)}
