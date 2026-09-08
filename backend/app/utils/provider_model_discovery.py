"""Live provider model discovery for Chat/Search model pickers.

Failures always return [] so curated catalogs remain the safe baseline.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_DISCOVERY_TIMEOUT_S = 10.0


def list_openai_chat_models_for_key(api_key: str) -> List[str]:
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=_DISCOVERY_TIMEOUT_S,
        )
        if response.status_code >= 400:
            return []
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            return []
        out: List[str] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or "").strip()
            if not model_id or not _is_openai_chat_model_id(model_id):
                continue
            out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("OpenAI model list probe failed: %s", exc)
        return []


def _is_openai_chat_model_id(model_id: str) -> bool:
    lowered = model_id.lower()
    excluded_tokens = (
        "embedding",
        "whisper",
        "tts",
        "dall-e",
        "davinci",
        "babbage",
        "ada-",
        "realtime",
        "audio",
        "transcribe",
        "moderation",
        "image",
        "sora",
        "computer-use",
    )
    if any(token in lowered for token in excluded_tokens):
        return False
    return (
        lowered.startswith("gpt-")
        or lowered.startswith("o1")
        or lowered.startswith("o3")
        or lowered.startswith("o4")
        or lowered.startswith("chatgpt-")
        or "codex" in lowered
    )


def list_anthropic_chat_models_for_key(api_key: str) -> List[str]:
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
            },
            timeout=_DISCOVERY_TIMEOUT_S,
        )
        if response.status_code >= 400:
            return []
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, list):
            return []
        out: List[str] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id") or "").strip()
            if not model_id:
                continue
            if "claude" not in model_id.lower():
                continue
            out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Anthropic model list probe failed: %s", exc)
        return []


def list_gemini_chat_models_for_key(api_key: str) -> List[str]:
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://generativelanguage.googleapis.com/v1beta/models",
            params={"key": key},
            timeout=_DISCOVERY_TIMEOUT_S,
        )
        if response.status_code >= 400:
            return []
        payload = response.json()
        models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            return []
        out: List[str] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if not name:
                continue
            # API returns "models/gemini-2.5-flash"
            model_id = name.split("/", 1)[-1].strip()
            if not model_id or "embed" in model_id.lower():
                continue
            methods = item.get("supportedGenerationMethods") or item.get(
                "supported_generation_methods"
            )
            if isinstance(methods, list) and methods:
                method_set = {str(m).lower() for m in methods}
                if "generatecontent" not in method_set and "generate_content" not in method_set:
                    continue
            out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Gemini model list probe failed: %s", exc)
        return []


def list_ollama_chat_models(base_url: Optional[str] = None) -> List[str]:
    try:
        import httpx
        from ..services.infra_env import ollama_base_url

        root = (base_url or ollama_base_url() or "").strip().rstrip("/")
        if not root:
            return []
        response = httpx.get(f"{root}/api/tags", timeout=_DISCOVERY_TIMEOUT_S)
        if response.status_code >= 400:
            return []
        payload = response.json()
        models = payload.get("models") if isinstance(payload, dict) else None
        if not isinstance(models, list):
            return []
        out: List[str] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("name") or item.get("model") or "").strip()
            if model_id:
                out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Ollama model list probe failed: %s", exc)
        return []


def list_live_chat_models_for_provider(
    provider: str,
    *,
    api_key: Optional[str] = None,
    ollama_base: Optional[str] = None,
) -> List[str]:
    """Dispatch live chat model discovery for a normalized provider key."""
    from .api_key import normalize_provider_for_connection_test
    from .mistral_models import list_mistral_chat_models_for_key

    provider_key = normalize_provider_for_connection_test(provider)
    if provider_key == "mistral":
        models = list_mistral_chat_models_for_key(api_key or "")
        return [m for m in models if m != "mistral-embed" and "embed" not in m.lower()]
    if provider_key == "openai":
        return list_openai_chat_models_for_key(api_key or "")
    if provider_key == "anthropic":
        return list_anthropic_chat_models_for_key(api_key or "")
    if provider_key == "gemini":
        return list_gemini_chat_models_for_key(api_key or "")
    if provider_key == "ollama":
        return list_ollama_chat_models(ollama_base)
    return []


def build_provider_enrichments(
    *,
    db: Any,
    user_id: int,
    project_id: Any,
    profile_type: str,
    settings_api_key: Optional[str] = None,
    settings_provider: Optional[str] = None,
    selected_chat: Optional[str] = None,
    selected_embedding: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """
    Build enrichments map for ``build_available_providers_payload``.

    Uses stored provider keys (never requires client plaintext). Live probe
    failures leave that provider at curated-only.
    """
    from .api_key import (
        normalize_provider_for_connection_test,
        resolve_stored_provider_api_key,
    )

    providers = ("openai", "anthropic", "mistral", "gemini", "ollama")
    active_provider = normalize_provider_for_connection_test(settings_provider)
    enrichments: Dict[str, Dict[str, Any]] = {}

    for provider_key in providers:
        api_key = resolve_stored_provider_api_key(
            db,
            user_id=user_id,
            project_id=project_id,
            provider=provider_key,
            profile_type=profile_type,
            settings_api_key=settings_api_key,
            settings_provider=settings_provider,
        )
        live_chat: List[str] = []
        try:
            if provider_key == "ollama":
                live_chat = list_live_chat_models_for_provider(provider_key)
            elif api_key:
                live_chat = list_live_chat_models_for_provider(
                    provider_key, api_key=api_key
                )
        except Exception as exc:
            logger.debug("Live discovery failed for %s: %s", provider_key, exc)
            live_chat = []

        entry: Dict[str, Any] = {
            "live_chat": live_chat,
            "live_embedding": [],
            "selected_chat": None,
            "selected_embedding": None,
        }
        if active_provider == provider_key:
            entry["selected_chat"] = (selected_chat or "").strip() or None
            entry["selected_embedding"] = (selected_embedding or "").strip() or None
        enrichments[provider_key] = entry

    return enrichments
