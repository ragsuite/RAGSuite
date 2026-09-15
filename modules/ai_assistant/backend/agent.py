"""AI Assistant agent: tool-calling loop over project operational data."""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterator, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from app.models import AIAssistantSettings
from app.services.rag.language_config import build_language_instruction
from app.utils.api_key import normalize_provider_for_connection_test

from .tools import (
    SYSTEM_PROMPT,
    TOOL_SPECS,
    execute_tool,
    heuristic_tools_for_message,
    resolve_product_links,
    sanitize_assistant_answer,
)

logger = logging.getLogger(__name__)


def _openai_compatible_base(provider: str, base_url: Optional[str]) -> tuple[str, Optional[str]]:
    """Return (base_url, default_header_style) for OpenAI-compatible clients."""
    p = normalize_provider_for_connection_test(provider)
    if base_url and base_url.strip():
        return base_url.rstrip("/"), p
    if p == "mistral":
        return "https://api.mistral.ai/v1", p
    if p == "ollama":
        return (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434/v1").rstrip("/"), p
    if p == "gemini":
        # OpenAI-compatible Gemini endpoint when available
        return "https://generativelanguage.googleapis.com/v1beta/openai", p
    return "https://api.openai.com/v1", p


def _build_client(settings: AIAssistantSettings):
    from openai import OpenAI

    provider = normalize_provider_for_connection_test(settings.model_provider)
    base_url, _ = _openai_compatible_base(provider, settings.base_url)
    api_key = (settings.api_key or "").strip() or ("ollama" if provider == "ollama" else "")
    if not api_key and provider != "ollama":
        raise ValueError("AI Assistant API key is not configured for this project.")
    return OpenAI(api_key=api_key or "ollama", base_url=base_url), provider


def _model_name(settings: AIAssistantSettings, provider: str) -> str:
    if settings.chat_model and settings.chat_model.strip():
        return settings.chat_model.strip()
    defaults = {
        "openai": "gpt-4o-mini",
        "mistral": "mistral-small-latest",
        "gemini": "gemini-2.0-flash",
        "ollama": "llama3.2",
    }
    return defaults.get(provider, "gpt-4o-mini")


def _temperature(settings: AIAssistantSettings) -> float:
    """Prefer low temperature to reduce invented URLs and metrics."""
    try:
        value = float(settings.temperature) if settings.temperature else 0.1
    except (TypeError, ValueError):
        value = 0.1
    return max(0.0, min(value, 0.2))


def _product_links_system_message() -> dict[str, Any]:
    facts = {
        "product": "RAGSuite",
        "links": resolve_product_links(),
        "note": "Use only these URLs. Do not invent alternate domains.",
    }
    return {
        "role": "system",
        "content": (
            "Official RAGSuite product links (authoritative — copy URLs only from this payload):\n"
            + json.dumps(facts, ensure_ascii=False)
        ),
    }


def run_assistant_turn(
    db: Session,
    *,
    project_id: UUID,
    settings: AIAssistantSettings,
    history: list[dict[str, Any]],
    user_message: str,
) -> Iterator[dict[str, Any]]:
    """
    Yield events:
      {"type":"token","content":"..."}
      {"type":"tool","name":"...","result":{...}}
      {"type":"done","content":"..."}
      {"type":"error","message":"..."}
    """
    try:
        client, provider = _build_client(settings)
    except Exception as exc:
        yield {"type": "error", "message": str(exc)}
        return

    model = _model_name(settings, provider)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        _product_links_system_message(),
    ]
    language_instruction = build_language_instruction(getattr(settings, "language", None) or "en")
    if language_instruction:
        messages.append({"role": "system", "content": language_instruction.strip()})
    for item in history:
        role = item.get("role")
        if role in ("user", "assistant") and item.get("content"):
            messages.append({"role": role, "content": item["content"]})
    messages.append({"role": "user", "content": user_message})

    supports_tools = provider in ("openai", "mistral", "gemini")
    max_iters = 4
    final_text = ""

    try:
        if supports_tools:
            for _ in range(max_iters):
                kwargs: dict[str, Any] = {
                    "model": model,
                    "messages": messages,
                    "tools": TOOL_SPECS,
                    "temperature": _temperature(settings),
                }
                if settings.max_tokens:
                    kwargs["max_tokens"] = int(settings.max_tokens)
                response = client.chat.completions.create(**kwargs)
                choice = response.choices[0].message
                tool_calls = getattr(choice, "tool_calls", None) or []
                if tool_calls:
                    assistant_msg: dict[str, Any] = {
                        "role": "assistant",
                        "content": choice.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.function.name,
                                    "arguments": tc.function.arguments or "{}",
                                },
                            }
                            for tc in tool_calls
                        ],
                    }
                    messages.append(assistant_msg)
                    for tc in tool_calls:
                        name = tc.function.name
                        raw = execute_tool(db, project_id, name, tc.function.arguments or "{}")
                        try:
                            parsed = json.loads(raw)
                        except json.JSONDecodeError:
                            parsed = {"raw": raw}
                        yield {"type": "tool", "name": name, "result": parsed}
                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": tc.id,
                                "content": raw,
                            }
                        )
                    continue

                final_text = (choice.content or "").strip()
                break
            else:
                final_text = final_text or "I gathered tool results but could not produce a final answer."
        else:
            # Ollama / unknown: run heuristic tools then answer without native tool API
            tool_names = heuristic_tools_for_message(user_message)
            if "product_links" not in tool_names:
                tool_names = ["product_links", *tool_names]
            tool_blocks: list[str] = []
            for name in tool_names:
                raw = execute_tool(db, project_id, name, {})
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError:
                    parsed = {"raw": raw}
                yield {"type": "tool", "name": name, "result": parsed}
                tool_blocks.append(f"### {name}\n{raw}")
            tool_context = "\n\n".join(tool_blocks)
            messages.append(
                {
                    "role": "system",
                    "content": (
                        "Tool results for this project (JSON). Answer the user using only this data "
                        "and the official product links above:\n\n"
                        + tool_context
                    ),
                }
            )
            kwargs = {
                "model": model,
                "messages": messages,
                "temperature": _temperature(settings),
            }
            if settings.max_tokens:
                kwargs["max_tokens"] = int(settings.max_tokens)
            response = client.chat.completions.create(**kwargs)
            final_text = (response.choices[0].message.content or "").strip()

        if not final_text:
            final_text = "No response generated. Check AI Assistant model settings."

        # Guardrail: rewrite known hallucinated docs hosts before streaming/persist.
        final_text = sanitize_assistant_answer(final_text, resolve_product_links())

        # Stream as chunks for the UI
        chunk_size = 48
        for i in range(0, len(final_text), chunk_size):
            yield {"type": "token", "content": final_text[i : i + chunk_size]}
        yield {"type": "done", "content": final_text}
    except Exception as exc:
        logger.exception("AI Assistant turn failed")
        yield {"type": "error", "message": str(exc)}
