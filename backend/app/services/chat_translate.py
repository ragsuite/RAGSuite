"""Non-mutating chat message translation for visitor language overlay."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any, Dict, List, Optional

from ..services.llmconn import LLMFactory
from ..services.rag.language_config import normalize_request_language, resolve_language_name

logger = logging.getLogger(__name__)

MAX_TRANSLATE_MESSAGES = 40
MAX_CHARS_PER_MESSAGE = 4000
MAX_TOTAL_CHARS = 48000


class TranslationEmptyError(RuntimeError):
    """LLM returned no usable translations for the requested messages."""


def _truncate(text: str, limit: int = MAX_CHARS_PER_MESSAGE) -> str:
    value = (text or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1] + "…"


def build_translate_prompt(
    target_language: str,
    messages: List[Dict[str, str]],
) -> str:
    """
    Use numeric keys (1..N) so the model returns stable JSON.
    Callers map indices back to real message ids.

    Input values are objects with role + text so the model can apply
    plain-text rules for user turns and Markdown-preserve rules for assistant.
    """
    language_name = resolve_language_name(target_language)
    payload = {
        str(i + 1): {
            "role": (m.get("role") or "assistant").strip() or "assistant",
            "text": _truncate(m.get("content") or ""),
        }
        for i, m in enumerate(messages)
    }
    return (
        f"Translate each item's \"text\" into {language_name}.\n"
        "Rules:\n"
        '- Output ONLY a JSON object whose values are translated strings '
        '(not objects). Keys must stay "1".."N" as strings.\n'
        '- User role ("user"): plain text only. Do NOT add Markdown '
        "(no **, __, #, ##, lists, or code fences).\n"
        '- Assistant role ("assistant"): preserve existing Markdown, links, '
        "and citation markers from the source. Do NOT invent new decorative "
        "Markdown that was not in the source.\n"
        "- Do not add explanations, notes, or commentary.\n"
        '- Example: {"1": "translated text", "2": "translated text"}\n\n'
        f"Input JSON:\n{json.dumps(payload, ensure_ascii=False)}"
    )


def parse_translation_map(raw: str, expected_ids: List[str]) -> Dict[str, str]:
    """
    Parse LLM JSON into {message_id: text}.

    Accepts either:
    - numeric keys "1".."N" (preferred), or
    - direct message id keys.
    """
    text = (raw or "").strip()
    if not text:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return {}
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            return {}
    if not isinstance(data, dict):
        return {}

    out: Dict[str, str] = {}
    expected = set(expected_ids)

    # Preferred: numeric index keys
    for i, mid in enumerate(expected_ids):
        key = str(i + 1)
        value = data.get(key)
        if value is None and (i + 1) in data:
            value = data.get(i + 1)
        if isinstance(value, str) and value.strip():
            out[mid] = value.strip()

    # Fallback: direct id keys
    if len(out) < len(expected_ids):
        for key, value in data.items():
            sid = str(key)
            if sid in expected and isinstance(value, str) and value.strip() and sid not in out:
                out[sid] = value.strip()

    return out


async def translate_messages_with_llm(
    *,
    llm_config: Optional[Dict[str, Any]],
    target_language: str,
    messages: List[Dict[str, str]],
) -> Dict[str, str]:
    if not llm_config:
        raise ValueError("LLM is not configured for this project")

    normalized = normalize_request_language(target_language)
    if not normalized:
        raise ValueError("Unsupported target language")

    clipped: List[Dict[str, str]] = []
    total_chars = 0
    for row in messages[:MAX_TRANSLATE_MESSAGES]:
        mid = str(row.get("id") or "").strip()
        content = _truncate(str(row.get("content") or ""))
        if not mid or not content:
            continue
        if total_chars + len(content) > MAX_TOTAL_CHARS:
            break
        clipped.append(
            {
                "id": mid,
                "role": str(row.get("role") or "assistant"),
                "content": content,
            }
        )
        total_chars += len(content)

    if not clipped:
        raise ValueError("No messages to translate")

    provider = llm_config.get("provider", "openai")
    model = llm_config.get("chat_model", "gpt-4o-mini")
    api_key = llm_config.get("api_key")
    llm = LLMFactory.get_llm(provider, model, api_key)
    prompt = build_translate_prompt(normalized, clipped)
    loop = asyncio.get_running_loop()
    result = await asyncio.wait_for(
        loop.run_in_executor(None, lambda: llm.complete(prompt)),
        timeout=90.0,
    )
    result_text = (result.text if hasattr(result, "text") else str(result)).strip()
    expected_ids = [m["id"] for m in clipped]
    translations = parse_translation_map(result_text, expected_ids)
    if not translations:
        logger.warning(
            "Chat translate returned empty map (expected %s ids). Raw head: %s",
            len(expected_ids),
            result_text[:300],
        )
        raise TranslationEmptyError("Translation produced no usable results")
    return translations
