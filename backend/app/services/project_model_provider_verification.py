"""API key verification for project provider configs (Model Configuration module).

A provider only counts as configured when its key works: saves probe the provider
first, and a stored key the provider rejected on its last test stops counting.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

from .model_connection_probe import is_probe_success, probe_provider_models

PROVIDER_LABELS = {
    "openai": "OpenAI",
    "azure_openai": "Azure OpenAI",
    "anthropic": "Anthropic",
    "mistral": "Mistral",
    "gemini": "Google Gemini",
    "ollama": "Custom LLM / Ollama",
}

_AUTH_FAILURE = re.compile(
    r"\b(401|403)\b"
    r"|authentication"
    r"|unauthori[sz]ed"
    r"|permission[_ ]denied"
    r"|invalid[_ ]api[_ ]key"
    r"|invalid x-api-key"
    r"|incorrect api key"
    r"|api key not valid"
    r"|api_key_invalid",
    re.IGNORECASE,
)
_MAX_REASON_CHARS = 300


def is_auth_failure(message: Optional[str]) -> bool:
    """True when a probe failure means the provider refused the key."""
    text = str(message or "")
    return text.startswith("Failed") and bool(_AUTH_FAILURE.search(text))


def is_key_rejected(row: Any) -> bool:
    """The last stored-key test failed because the provider refused the key.

    Timeouts and network errors do not count, so a flaky test never unconfigures
    a working provider.
    """
    if row is None or getattr(row, "last_test_status", None) != "failed":
        return False
    parts = str(getattr(row, "last_test_message", None) or "").split("; ")
    return any(is_auth_failure(part.split(": ", 1)[-1]) for part in parts)


def summarize_results(results: Dict[str, str]) -> str:
    return "; ".join(f"{k}: {v}" for k, v in results.items())[:2000]


def _failure_reason(provider: str, results: Dict[str, str]) -> str:
    label = PROVIDER_LABELS.get(provider, provider)
    failures = [str(v) for v in results.values() if not str(v).startswith("Success")]
    if any(is_auth_failure(f) for f in failures):
        return f"{label} rejected this API key. Check that the key belongs to {label}."
    detail = (failures[0] if failures else "No response").removeprefix("Failed:").strip()
    return f"Couldn't verify the {label} configuration: {detail[:_MAX_REASON_CHARS]}"


async def verify_before_save(
    provider: str,
    *,
    chat_model: str,
    embedding_model: Optional[str],
    api_key: Optional[str],
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
) -> Tuple[Dict[str, str], Optional[str]]:
    """Probe chat (and embedding) with the key about to be saved.

    Returns ``(results, failure_reason)``; ``failure_reason`` is None on success.
    """
    from .project_model_providers import azure_openai_api_version, normalize_azure_api_version

    resolved_version = None
    if provider == "azure_openai":
        resolved_version = azure_openai_api_version(normalize_azure_api_version(api_version))

    results = await probe_provider_models(
        provider,
        chat_model=chat_model,
        embedding_model=embedding_model,
        api_key=api_key,
        endpoint=endpoint,
        api_version=resolved_version,
    )
    if is_probe_success(results):
        return results, None
    return results, _failure_reason(provider, results)
