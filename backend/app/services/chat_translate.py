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
# Long assistant answers stay intact. Above this, the request is refused.
MAX_CHARS_PER_MESSAGE = 24000
MAX_TOTAL_CHARS = 192000
# One model call stays small enough to finish. Longer answers are split,
# translated, and joined back in order.
TRANSLATE_SOURCE_CHUNK = 8000
TRANSLATE_PAIR_BUDGET = 8000
TRANSLATE_MAX_TOKENS_CAP = 8192


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
        "- Put line breaks inside those strings as \\n. Do not wrap a value "
        'in {"role","text"}.\n'
        '- User role ("user"): plain text only. Do NOT add Markdown '
        "(no **, __, #, ##, lists, or code fences).\n"
        '- Assistant role ("assistant"): preserve existing Markdown, links, '
        "and citation markers from the source. Do NOT invent new decorative "
        "Markdown that was not in the source.\n"
        "- Do not add explanations, notes, or commentary.\n"
        '- Example: {"1": "translated text", "2": "translated text"}\n\n'
        f"Input JSON:\n{json.dumps(payload, ensure_ascii=False)}"
    )


def _escape_raw_newlines_in_strings(text: str) -> str:
    """Turn literal newlines inside JSON strings into \\n so json.loads can succeed."""
    out: List[str] = []
    in_string = False
    escaped = False
    for ch in text:
        if in_string:
            if escaped:
                out.append(ch)
                escaped = False
                continue
            if ch == "\\":
                out.append(ch)
                escaped = True
                continue
            if ch == '"':
                in_string = False
                out.append(ch)
                continue
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                continue
            out.append(ch)
            continue
        if ch == '"':
            in_string = True
        out.append(ch)
    return "".join(out)


def _load_json_object(text: str) -> Optional[Dict[str, Any]]:
    """Parse a JSON object, repairing unescaped newlines models put inside strings."""
    candidates = [text]
    repaired = _escape_raw_newlines_in_strings(text)
    if repaired != text:
        candidates.append(repaired)
    for candidate in candidates:
        blobs = [candidate]
        start = candidate.find("{")
        end = candidate.rfind("}")
        if start >= 0 and end > start:
            blobs.append(candidate[start : end + 1])
        list_start = candidate.find("[")
        list_end = candidate.rfind("]")
        if list_start >= 0 and list_end > list_start:
            blobs.append(candidate[list_start : list_end + 1])
        for blob in blobs:
            try:
                data = json.loads(blob)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict):
                return data
            if isinstance(data, list):
                return {str(i + 1): item for i, item in enumerate(data)}
    return None


def _translation_text(value: Any) -> Optional[str]:
    """Accept a plain string or the {role, text} object some models echo back."""
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    if isinstance(value, dict):
        for key in ("text", "content", "translation", "translated", "value"):
            inner = value.get(key)
            if isinstance(inner, str) and inner.strip():
                return inner.strip()
    return None


def _unwrap_translation_object(data: Dict[str, Any], expected_count: int) -> Dict[str, Any]:
    """Drop a single wrapper key when the model nests the map under it."""
    if expected_count <= 0:
        return data
    if any(str(i) in data or i in data for i in range(1, expected_count + 1)):
        return data
    for wrap in ("translations", "result", "output", "messages"):
        inner = data.get(wrap)
        if isinstance(inner, dict):
            return inner
        if isinstance(inner, list):
            return {str(i + 1): item for i, item in enumerate(inner)}
    return data


_COMPLETE_STRING_PAIR = re.compile(
    r'"((?:\\.|[^"\\])*)"\s*:\s*"((?:\\.|[^"\\])*)"'
)
_SKIP_SALVAGE_KEYS = frozenset({"role", "text", "content", "translation", "translated", "value"})


def _salvage_complete_string_pairs(text: str) -> Dict[str, Any]:
    """Keep finished `"key": "value"` pairs when the model stops mid-JSON."""
    found: Dict[str, Any] = {}
    for raw_key, raw_value in _COMPLETE_STRING_PAIR.findall(text or ""):
        try:
            key = json.loads(f'"{raw_key}"')
            value = json.loads(f'"{raw_value}"')
        except json.JSONDecodeError:
            continue
        if not isinstance(key, str) or key in _SKIP_SALVAGE_KEYS:
            continue
        if isinstance(value, str) and value.strip():
            found[key] = value.strip()
    return found


def parse_translation_map(raw: str, expected_ids: List[str]) -> Dict[str, str]:
    """
    Parse LLM JSON into {message_id: text}.

    Accepts either:
    - numeric keys "1".."N" (preferred), or
    - direct message id keys.

    Values may be strings, or objects shaped like {"role", "text"} — models
    often echo the input object instead of returning a bare string. Literal
    newlines inside those strings are repaired before JSON parsing.
    """
    text = (raw or "").strip()
    if not text:
        return {}
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    data = _load_json_object(text)
    if not data:
        data = _salvage_complete_string_pairs(text)
    if not data:
        return {}
    data = _unwrap_translation_object(data, len(expected_ids))

    out: Dict[str, str] = {}
    expected = set(expected_ids)

    # Preferred: numeric index keys
    for i, mid in enumerate(expected_ids):
        key = str(i + 1)
        value = data.get(key)
        if value is None and (i + 1) in data:
            value = data.get(i + 1)
        translated = _translation_text(value)
        if translated:
            out[mid] = translated

    # Fallback: direct id keys
    if len(out) < len(expected_ids):
        for key, value in data.items():
            sid = str(key)
            translated = _translation_text(value)
            if sid in expected and translated and sid not in out:
                out[sid] = translated

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
    loop = asyncio.get_running_loop()

    expanded, chunk_owner = _expand_long_messages(clipped)
    translations: Dict[str, str] = {}
    pending = list(expanded)
    for _attempt in range(2):
        if not pending:
            break
        still_missing: List[Dict[str, str]] = []
        for group in _translation_groups(pending):
            group_map = await _translate_group(
                llm,
                loop,
                normalized,
                group,
            )
            translations.update(group_map)
            still_missing.extend(row for row in group if row["id"] not in group_map)
        pending = still_missing

    merged = _collapse_chunks(translations, chunk_owner, [row["id"] for row in clipped])
    if not merged:
        raise TranslationEmptyError("Translation produced no usable results")
    missing_ids = [row["id"] for row in clipped if row["id"] not in merged]
    if missing_ids:
        logger.warning(
            "Chat translate missing %s of %s messages after retry",
            len(missing_ids),
            len(clipped),
        )
        raise TranslationEmptyError("Translation produced no usable results")
    return merged


def _split_content(text: str, limit: int = TRANSLATE_SOURCE_CHUNK) -> List[str]:
    """Split on paragraph breaks so a long answer is translated in full."""
    if len(text) <= limit:
        return [text]
    parts: List[str] = []
    rest = text
    while rest:
        if len(rest) <= limit:
            parts.append(rest)
            break
        window = rest[:limit]
        cut = window.rfind("\n\n")
        if cut < limit // 2:
            cut = window.rfind("\n")
        if cut < limit // 2:
            cut = limit
        parts.append(rest[:cut])
        rest = rest[cut:]
    return [part for part in parts if part]


def _expand_long_messages(
    messages: List[Dict[str, str]],
) -> tuple[List[Dict[str, str]], Dict[str, str]]:
    """Break one long message into ordered chunks. Map chunk id -> original id."""
    expanded: List[Dict[str, str]] = []
    owner: Dict[str, str] = {}
    for row in messages:
        chunks = _split_content(row["content"])
        if len(chunks) == 1:
            expanded.append(row)
            continue
        for index, chunk in enumerate(chunks):
            chunk_id = f"{row['id']}::{index}"
            owner[chunk_id] = row["id"]
            expanded.append(
                {
                    "id": chunk_id,
                    "role": row.get("role") or "assistant",
                    "content": chunk,
                }
            )
    return expanded, owner


def _collapse_chunks(
    translations: Dict[str, str],
    owner: Dict[str, str],
    original_ids: List[str],
) -> Dict[str, str]:
    if not owner:
        return {mid: translations[mid] for mid in original_ids if mid in translations}
    expected_parts: Dict[str, int] = {}
    for original in owner.values():
        expected_parts[original] = expected_parts.get(original, 0) + 1
    grouped: Dict[str, List[tuple[int, str]]] = {}
    plain: Dict[str, str] = {}
    for key, value in translations.items():
        original = owner.get(key)
        if original is None:
            plain[key] = value
            continue
        index = int(key.rsplit("::", 1)[-1])
        grouped.setdefault(original, []).append((index, value))
    out: Dict[str, str] = {}
    for mid in original_ids:
        if mid in grouped and len(grouped[mid]) == expected_parts.get(mid, 0):
            ordered = [text for _, text in sorted(grouped[mid])]
            joined = "".join(ordered).strip()
            if joined:
                out[mid] = joined
        elif mid in plain and plain[mid].strip():
            out[mid] = plain[mid].strip()
    return out


def _translation_groups(messages: List[Dict[str, str]]) -> List[List[Dict[str, str]]]:
    """Pair short messages. Keep a long one alone so the reply is not cut off."""
    groups: List[List[Dict[str, str]]] = []
    index = 0
    while index < len(messages):
        current = messages[index]
        nxt = messages[index + 1] if index + 1 < len(messages) else None
        current_len = len(current.get("content") or "")
        next_len = len(nxt.get("content") or "") if nxt else 0
        if nxt is not None and current_len + next_len <= TRANSLATE_PAIR_BUDGET:
            groups.append([current, nxt])
            index += 2
            continue
        groups.append([current])
        index += 1
    return groups


def _max_tokens_for(group: List[Dict[str, str]]) -> int:
    chars = sum(len(row.get("content") or "") for row in group)
    # Leave room for JSON and for languages that use more tokens per character.
    estimate = chars // 2 + 512
    return max(1024, min(TRANSLATE_MAX_TOKENS_CAP, estimate))


def _complete_translation(llm: Any, prompt: str, max_tokens: int) -> Any:
    """Ask for a long enough reply. The Mistral client otherwise stops at 512 tokens."""
    try:
        return llm.complete(prompt, max_tokens=max_tokens)
    except TypeError:
        return llm.complete(prompt)


async def _translate_group(
    llm: Any,
    loop: asyncio.AbstractEventLoop,
    target_language: str,
    group: List[Dict[str, str]],
) -> Dict[str, str]:
    prompt = build_translate_prompt(target_language, group)
    max_tokens = _max_tokens_for(group)
    result = await asyncio.wait_for(
        loop.run_in_executor(
            None,
            lambda: _complete_translation(llm, prompt, max_tokens),
        ),
        timeout=90.0,
    )
    result_text = (result.text if hasattr(result, "text") else str(result)).strip()
    expected_ids = [row["id"] for row in group]
    translations = parse_translation_map(result_text, expected_ids)
    if len(translations) < len(expected_ids):
        logger.warning(
            "Chat translate parsed %s of %s ids (raw length %s, ends_with_brace=%s). Raw head: %s",
            len(translations),
            len(expected_ids),
            len(result_text),
            result_text.rstrip().endswith("}"),
            result_text[:300],
        )
    return translations
