"""Curated LLM provider catalogs and merge helpers for Chat/Search model pickers.

Additive only: never remove model ids that were previously exposed in the UI.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence


def _entry(name: str, value: str) -> Dict[str, str]:
    return {"name": name, "value": value}


OPENAI_CHAT_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("GPT-4", "gpt-4"),
    _entry("GPT-4 Turbo", "gpt-4-turbo"),
    _entry("GPT-3.5 Turbo", "gpt-3.5-turbo"),
    _entry("GPT-4o", "gpt-4o"),
    _entry("GPT-4o-mini", "gpt-4o-mini"),
    _entry("GPT-4.1", "gpt-4.1"),
    _entry("GPT-4.1 Mini", "gpt-4.1-mini"),
    _entry("GPT-4.1 Nano", "gpt-4.1-nano"),
    _entry("GPT-5", "gpt-5"),
    _entry("GPT-5 Mini", "gpt-5-mini"),
    _entry("GPT-5 Nano", "gpt-5-nano"),
    _entry("GPT-5.1", "gpt-5.1"),
    _entry("GPT-5.2", "gpt-5.2"),
    _entry("GPT-5.4", "gpt-5.4"),
    _entry("GPT-5.4 Pro", "gpt-5.4-pro"),
    _entry("GPT-5.4 Mini", "gpt-5.4-mini"),
    _entry("GPT-5.4 Nano", "gpt-5.4-nano"),
    _entry("o3", "o3"),
    _entry("o4-mini", "o4-mini"),
]

OPENAI_EMBEDDING_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Text Embedding 3 Large", "text-embedding-3-large"),
    _entry("Text Embedding 3 Small", "text-embedding-3-small"),
]

ANTHROPIC_CHAT_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Claude Opus 5", "claude-opus-5"),
    _entry("Claude Sonnet 5", "claude-sonnet-5"),
    _entry("Claude Haiku 4.5", "claude-haiku-4-5"),
    _entry("Claude Fable 5.1", "claude-fable-5-1"),
    _entry("Claude Opus 4.8", "claude-opus-4-8"),
    _entry("Claude Sonnet 4.6", "claude-sonnet-4-6"),
    _entry("Claude 3 Opus", "claude-3-opus-20240229"),
    _entry("Claude 3 Sonnet", "claude-3-sonnet-20240229"),
    _entry("Claude 3 Haiku", "claude-3-haiku-20240307"),
    _entry("Claude 3.5 Sonnet", "claude-3-5-sonnet-20240620"),
]

MISTRAL_CHAT_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Mistral Small", "mistral-small-latest"),
    _entry("Ministral 3B", "ministral-3b-latest"),
    _entry("Ministral 8B", "ministral-8b-latest"),
    _entry("Ministral 14B", "ministral-14b-latest"),
    _entry("Mistral Medium", "mistral-medium-latest"),
    _entry("Mistral Large", "mistral-large-latest"),
    _entry("Open Mistral Nemo", "open-mistral-nemo"),
    _entry("Codestral", "codestral-latest"),
    _entry("Codestral 2508", "codestral-2508"),
    _entry("Magistral Medium", "magistral-medium-latest"),
    _entry("Magistral Small", "magistral-small-latest"),
    _entry("Leanstral 1.5", "labs-leanstral-1-5"),
    _entry("Leanstral 1.5.1", "labs-leanstral-1-5-1"),
]

MISTRAL_EMBEDDING_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Mistral Embed", "mistral-embed"),
]

GEMINI_CHAT_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Gemini 2.0 Flash-lite", "gemini-2.0-flash-lite"),
    _entry("Gemini 2.0 Flash", "gemini-2.0-flash"),
    _entry("Gemini 2.5 Flash Lite", "gemini-2.5-flash-lite"),
    _entry("Gemini 2.5 Flash", "gemini-2.5-flash"),
    _entry("Gemini 2.5 Pro", "gemini-2.5-pro"),
    _entry("Gemini 3 Flash Preview", "gemini-3-flash-preview"),
    _entry("Gemini 3.6 Flash", "gemini-3.6-flash"),
    _entry("Gemini 3.8 Flash", "gemini-3.8-flash"),
]

GEMINI_EMBEDDING_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Gemini Embedding 001", "gemini-embedding-001"),
]

OLLAMA_CHAT_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Custom Model (Default)", "custom-default"),
    _entry("Llama 3 8B", "llama3:8b"),
    _entry("Mistral", "mistral"),
    _entry("Gemma 2", "gemma2"),
    _entry("Gemma 3 27B Cloud", "gemma3:27b-cloud"),
    _entry("Gemma 4 31B Cloud", "gemma4:31b-cloud"),
]

OLLAMA_EMBEDDING_MODEL_CATALOG: List[Dict[str, str]] = [
    _entry("Jina v2 Base DE", "jina/jina-embeddings-v2-base-de"),
]


def humanize_model_id(model_id: str) -> str:
    text = (model_id or "").strip()
    if not text:
        return text
    return text.replace("-", " ").replace("_", " ").replace(":", " ").strip()


def merge_model_entries(
    curated: Sequence[Dict[str, str]],
    live_ids: Optional[Iterable[str]] = None,
    selected_ids: Optional[Iterable[Optional[str]]] = None,
) -> List[Dict[str, str]]:
    """Union curated + live + selected by value; curated labels win."""
    by_value: Dict[str, Dict[str, str]] = {}
    order: List[str] = []

    def _add(value: str, name: Optional[str] = None, *, prefer_name: bool = False) -> None:
        key = (value or "").strip()
        if not key:
            return
        if key not in by_value:
            by_value[key] = {
                "name": (name or humanize_model_id(key)).strip() or key,
                "value": key,
            }
            order.append(key)
            return
        if prefer_name and name:
            by_value[key]["name"] = name.strip() or by_value[key]["name"]

    for entry in curated:
        if not isinstance(entry, dict):
            continue
        value = str(entry.get("value") or "").strip()
        name = str(entry.get("name") or "").strip() or None
        _add(value, name, prefer_name=True)

    for live_id in live_ids or []:
        _add(str(live_id or "").strip())

    for selected in selected_ids or []:
        if selected is None:
            continue
        _add(str(selected).strip())

    return [by_value[key] for key in order]


def build_available_providers_payload(
    *,
    enrichments: Optional[Dict[str, Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """
    Build the shared available-models payload for chat + search.

    ``enrichments`` maps provider value -> {
      "live_chat": [...],
      "live_embedding": [...],
      "selected_chat": str | None,
      "selected_embedding": str | None,
    }
    """
    enrichments = enrichments or {}

    providers = [
        {
            "provider": "OpenAI",
            "value": "openai",
            "chat_models": OPENAI_CHAT_MODEL_CATALOG,
            "embedding_models": OPENAI_EMBEDDING_MODEL_CATALOG,
        },
        {
            "provider": "Anthropic",
            "value": "anthropic",
            "chat_models": ANTHROPIC_CHAT_MODEL_CATALOG,
            "embedding_models": [],
        },
        {
            "provider": "Mistral",
            "value": "mistral",
            "chat_models": MISTRAL_CHAT_MODEL_CATALOG,
            "embedding_models": MISTRAL_EMBEDDING_MODEL_CATALOG,
        },
        {
            "provider": "Google Gemini",
            "value": "gemini",
            "chat_models": GEMINI_CHAT_MODEL_CATALOG,
            "embedding_models": GEMINI_EMBEDDING_MODEL_CATALOG,
        },
        {
            "provider": "Custom LLM / Ollama",
            "value": "ollama",
            "chat_models": OLLAMA_CHAT_MODEL_CATALOG,
            "embedding_models": OLLAMA_EMBEDDING_MODEL_CATALOG,
        },
    ]

    out: List[Dict[str, Any]] = []
    for row in providers:
        provider_key = str(row["value"])
        extra = enrichments.get(provider_key) or {}
        chat_models = merge_model_entries(
            row["chat_models"],
            live_ids=extra.get("live_chat") or [],
            selected_ids=[extra.get("selected_chat")],
        )
        embedding_models = merge_model_entries(
            row["embedding_models"],
            live_ids=extra.get("live_embedding") or [],
            selected_ids=[extra.get("selected_embedding")],
        )
        out.append(
            {
                "provider": row["provider"],
                "value": provider_key,
                "chat_models": chat_models,
                "embedding_models": embedding_models,
            }
        )
    return out
