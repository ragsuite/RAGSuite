"""Helpers for Mistral chat model discovery and connection-test diagnostics."""
from __future__ import annotations

import logging
from typing import Any, List

logger = logging.getLogger(__name__)

# Curated chat models for UI pickers (embed is separate).
MISTRAL_CHAT_MODEL_CATALOG = [
    {"name": "Mistral Small", "value": "mistral-small-latest"},
    {"name": "Ministral 8B", "value": "ministral-8b-latest"},
    {"name": "Mistral Medium", "value": "mistral-medium-latest"},
    {"name": "Mistral Large", "value": "mistral-large-latest"},
    {"name": "Open Mistral Nemo", "value": "open-mistral-nemo"},
]


def _parse_models_payload(payload: Any) -> List[dict]:
    if isinstance(payload, list):
        return [m for m in payload if isinstance(m, dict)]
    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [m for m in data if isinstance(m, dict)]
    return []


def _is_chat_capable_model(model_id: str, caps: Any) -> bool:
    if isinstance(caps, dict) and caps.get("completion_chat") is True:
        return True
    lowered = model_id.lower()
    if lowered == "mistral-embed" or lowered.endswith("-embed"):
        return False
    # When capabilities are omitted, treat non-embed ids as chat candidates.
    return bool(model_id.strip())


def list_mistral_chat_models_for_key(api_key: str) -> List[str]:
    """Return chat-capable Mistral model ids allowed for this API key."""
    key = (api_key or "").strip()
    if not key:
        return []
    try:
        import httpx

        response = httpx.get(
            "https://api.mistral.ai/v1/models",
            headers={"Authorization": f"Bearer {key}"},
            timeout=10.0,
        )
        if response.status_code >= 400:
            return []
        models = _parse_models_payload(response.json())
        out: List[str] = []
        for model in models:
            model_id = str(model.get("id") or "").strip()
            if not model_id:
                continue
            if _is_chat_capable_model(model_id, model.get("capabilities")):
                out.append(model_id)
        return sorted(set(out))
    except Exception as exc:
        logger.debug("Mistral model list probe failed: %s", exc)
        return []


def format_mistral_chat_test_failure(model: str, api_key: str, exc: BaseException | str) -> str:
    """Turn a Mistral chat 403 into actionable model-scope guidance."""
    base = str(exc).strip() or "Access denied"
    lower = base.lower()
    if not any(token in lower for token in ("403", "forbidden", "access denied", "scope")):
        return f"Failed: {base}"

    allowed = list_mistral_chat_models_for_key(api_key)
    chat_models = [m for m in allowed if m != "mistral-embed" and "embed" not in m.lower()]

    if not chat_models:
        return (
            f"Failed: Access denied for chat model '{model}'. "
            "Your Mistral API key works for embeddings but has no chat model access. "
            "In the Mistral console, create or edit the key to allow chat models."
        )

    if model not in chat_models:
        preview = ", ".join(chat_models[:6])
        suffix = "..." if len(chat_models) > 6 else ""
        return (
            f"Failed: Access denied for '{model}'. "
            f"Your key is scoped to other chat models: {preview}{suffix}. "
            "Select one of these in Chat model, then save and test again."
        )

    return f"Failed: {base}"
