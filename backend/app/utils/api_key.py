"""Helpers for masked API keys sent to/from the browser."""
from typing import Optional, Tuple


def is_masked_api_key(key: Optional[str]) -> bool:
    """True when the value is the first-4 + '...' + last-4 sentinel from GET config."""
    if not key:
        return False
    key = key.strip()
    return "..." in key and len(key) <= 16


def resolve_api_key_for_test(incoming: Optional[str], stored: Optional[str]) -> Optional[str]:
    """
    Use a freshly typed key when provided; otherwise fall back to the stored key.
    Never send the masked sentinel to external providers.
    """
    incoming = (incoming or "").strip()
    if incoming and not is_masked_api_key(incoming):
        return incoming
    if stored and stored.strip():
        return stored.strip()
    return incoming or None


def normalize_provider_for_connection_test(provider: Optional[str]) -> str:
    """Normalize provider aliases the same way chat/search /test routes do."""
    provider_key = (provider or "").strip().lower()
    if not provider_key:
        return ""
    if "google" in provider_key or "gemini" in provider_key:
        return "gemini"
    if "mistral" in provider_key:
        return "mistral"
    if "anthropic" in provider_key or "claude" in provider_key:
        return "anthropic"
    if "openai" in provider_key:
        return "openai"
    if "custom" in provider_key or "ollama" in provider_key:
        return "ollama"
    return provider_key


def missing_hosted_api_key_test_message(provider_label: str) -> str:
    """Explicit failure when Test connection cannot probe a hosted provider."""
    label = (provider_label or "this provider").strip() or "this provider"
    return (
        f"Failed: API key required for {label}. "
        f"Add a valid {label} API key to test this model. "
        f"Runtime would fall back to a local Ollama model, which does not need an API key."
    )


def resolve_usable_api_key_for_connection_test(
    provider: Optional[str],
    incoming: Optional[str],
    stored: Optional[str],
) -> Tuple[Optional[str], Optional[str]]:
    """
    Resolve a key for Model Settings Test connection.

    Returns ``(usable_key, failure_message)``. When ``failure_message`` is set,
    callers must not probe LLM/embedder (avoids silent Ollama fallback errors).

    Ollama/local providers do not require a real API key — ``failure_message`` is None
    and ``usable_key`` may be a placeholder or None.
    """
    provider_key = normalize_provider_for_connection_test(provider)
    resolved = resolve_api_key_for_test(incoming, stored)

    if provider_key == "ollama":
        return resolved, None

    from ..services.rag.embedder_factory import (
        is_ollama_placeholder_api_key,
        usable_api_key_for_provider,
    )

    usable = usable_api_key_for_provider(provider_key, resolved)
    # Anthropic (and any hosted chat-only provider) is not in the embedding hosted set;
    # still reject the Ollama internal placeholder so we never probe with it.
    if not usable or is_ollama_placeholder_api_key(resolved):
        return None, missing_hosted_api_key_test_message(provider_key or "this provider")
    return usable, None
