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

FAQ_ANSWER_SOURCE = "faq"
FAQ_ANSWER_MAX_LENGTH = 4000
FAQ_STREAM_MAX_CHUNKS = 60
FAQ_STREAM_CHUNK_DELAY_S = 0.035

_WHITESPACE_RE = re.compile(r"\s+")
_WORD_RE = re.compile(r"\S+\s*")


def normalize_for_match(value: str) -> str:
    """Case- and whitespace-insensitive form used to compare a clicked question with its FAQ."""
    return _WHITESPACE_RE.sub(" ", (value or "").strip()).casefold()


def chunk_faq_answer(text: str, max_chunks: int = FAQ_STREAM_MAX_CHUNKS) -> List[str]:
    """Split text into word chunks (whitespace preserved) so `"".join(chunks) == text`."""
    if not text:
        return []
    words = _WORD_RE.findall(text)
    if not words:
        return [text]
    leading = text[: len(text) - len(text.lstrip())]
    if leading:
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
