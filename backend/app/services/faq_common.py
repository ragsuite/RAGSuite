"""Shared helpers for admin-configured FAQ answers (chatbot and search).

Configured answers bypass RAG but are streamed in small paced chunks so the UI renders
them exactly like a generated answer.
"""
from __future__ import annotations

import asyncio
import json
import math
import re
from typing import Any, AsyncIterator, Dict, List, Optional

from .rich_text import is_rich_html, normalize_rich_text, rich_html_to_text, rich_text_length

FAQ_ANSWER_SOURCE = "faq"
# Visible characters (rich answers are measured without markup).
FAQ_ANSWER_MAX_LENGTH = 4000
# Stored HTML cap for rich answers.
FAQ_ANSWER_MAX_RAW_LENGTH = 16000
FAQ_STREAM_MAX_CHUNKS = 60
FAQ_STREAM_CHUNK_DELAY_S = 0.035

_WHITESPACE_RE = re.compile(r"\s+")
_WORD_RE = re.compile(r"\S+\s*")
# Tags are atomic so a stream chunk never ends inside `<...>`.
_HTML_TOKEN_RE = re.compile(r"<[^>]*>|[^<\s]+\s*|\s+|<")


def normalize_for_match(value: str) -> str:
    """Case- and whitespace-insensitive form used to compare a clicked question with its FAQ."""
    return _WHITESPACE_RE.sub(" ", (value or "").strip()).casefold()


def faq_answer_within_limits(answer: str) -> bool:
    if is_rich_html(answer):
        return len(answer) <= FAQ_ANSWER_MAX_RAW_LENGTH and rich_text_length(answer) <= FAQ_ANSWER_MAX_LENGTH
    return len(answer) <= FAQ_ANSWER_MAX_LENGTH


def normalize_faq_answer(value: Any) -> str:
    """Sanitized rich answer or trimmed plain answer, kept within the FAQ limits."""
    answer = normalize_rich_text(value if isinstance(value, str) else str(value or ""))
    if faq_answer_within_limits(answer):
        return answer
    if is_rich_html(answer):
        # Never cut HTML mid-tag; over-limit rich answers degrade to their readable text.
        answer = rich_html_to_text(answer)
    return answer[:FAQ_ANSWER_MAX_LENGTH]


def faq_answer_for_history(answer: str) -> str:
    """Plain-text form of a configured answer for LLM conversation context."""
    return rich_html_to_text(answer)


def _chunk_tokens(text: str) -> List[str]:
    if not is_rich_html(text):
        return _WORD_RE.findall(text)
    tokens = _HTML_TOKEN_RE.findall(text)
    if "".join(tokens) != text:
        return _WORD_RE.findall(text)
    # Glue tags onto the following word so every chunk carries visible text.
    merged: List[str] = []
    pending = ""
    for token in tokens:
        if token.startswith("<") and token.endswith(">") or token.isspace():
            pending += token
            continue
        merged.append(pending + token)
        pending = ""
    if pending:
        if merged:
            merged[-1] += pending
        else:
            merged.append(pending)
    return merged


def chunk_faq_answer(text: str, max_chunks: int = FAQ_STREAM_MAX_CHUNKS) -> List[str]:
    """Split text into word chunks (whitespace and tags preserved) so `"".join(chunks) == text`."""
    if not text:
        return []
    words = _chunk_tokens(text)
    if not words:
        return [text]
    joined = "".join(words)
    if joined != text:
        leading = text[: len(text) - len(text.lstrip())]
        words[0] = leading + words[0]
    group = max(1, math.ceil(len(words) / max(1, max_chunks)))
    return ["".join(words[i : i + group]) for i in range(0, len(words), group)]


async def iter_paced_tokens(text: str, delay_s: Optional[float] = None) -> AsyncIterator[str]:
    """Yield answer chunks with a short pause between them (caller wraps them as SSE)."""
    delay = FAQ_STREAM_CHUNK_DELAY_S if delay_s is None else delay_s
    for index, chunk in enumerate(chunk_faq_answer(text)):
        if index and delay > 0:
            await asyncio.sleep(delay)
        yield chunk


def sse_event(payload: Dict[str, Any]) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def stamp_answer_source(snapshot: Any, answer_source: Optional[str]) -> Any:
    """Record where an answer came from on the execution snapshot (read by history list views)."""
    if answer_source and isinstance(snapshot, dict):
        snapshot["answer_source"] = answer_source
    return snapshot
