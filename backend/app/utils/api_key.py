"""Helpers for masked API keys sent to/from the browser."""
from typing import Any, Dict, Optional, Tuple


def is_masked_api_key(key: Optional[str]) -> bool:
    """True when the value is the first-4 + '...' + last-4 sentinel from GET config."""
    if not key:
        return False
    key = key.strip()
    return "..." in key and len(key) <= 16


def mask_api_key(key: Optional[str]) -> Optional[str]:
    """Return a masked version of an API key safe to send to the browser."""
    if not key:
        return None
    key = key.strip()
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "..." + key[-4:]


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


def _profile_key_is_usable(provider: str, api_key: Optional[str]) -> bool:
    if not api_key or not str(api_key).strip():
        return False
    from ..services.rag.embedder_factory import is_ollama_placeholder_api_key

    if is_ollama_placeholder_api_key(api_key):
        return False
    if provider == "ollama":
        return False
    return True


def resolve_stored_provider_api_key(
    db: Any,
    *,
    user_id: int,
    project_id: Any,
    provider: Optional[str],
    profile_type: str,
    settings_api_key: Optional[str] = None,
    settings_provider: Optional[str] = None,
) -> Optional[str]:
    """
    Resolve a plaintext stored key for the selected provider.

    Prefers ModelConfigProfile rows for ``(user, project, provider, profile_type)``,
    then falls back to settings.api_key when the settings provider family matches
    (or when no profile exists and settings still has a usable key).
    """
    from ..models import ModelConfigProfile
    from sqlalchemy import and_

    provider_key = normalize_provider_for_connection_test(provider)
    if not provider_key:
        return (settings_api_key or "").strip() or None

    profiles = (
        db.query(ModelConfigProfile)
        .filter(
            and_(
                ModelConfigProfile.user_id == user_id,
                ModelConfigProfile.project_id == project_id,
                ModelConfigProfile.profile_type == profile_type,
            )
        )
        .order_by(ModelConfigProfile.updated_at.desc())
        .all()
    )
    for profile in profiles:
        if normalize_provider_for_connection_test(profile.provider) != provider_key:
            continue
        key = (profile.api_key or "").strip()
        if _profile_key_is_usable(provider_key, key):
            return key

    settings_key = (settings_api_key or "").strip() or None
    if not settings_key or not _profile_key_is_usable(provider_key, settings_key):
        return None

    settings_family = normalize_provider_for_connection_test(settings_provider)
    if settings_family and settings_family != provider_key:
        return None
    return settings_key


def build_provider_api_key_masks(
    db: Any,
    *,
    user_id: int,
    project_id: Any,
    profile_type: str,
    active_provider: Optional[str] = None,
    active_api_key: Optional[str] = None,
) -> Dict[str, str]:
    """
    Build ``{provider: masked_key}`` for UI cache-like provider switching.
    Never includes plaintext secrets.
    """
    from ..models import ModelConfigProfile
    from sqlalchemy import and_

    result: Dict[str, str] = {}
    profiles = (
        db.query(ModelConfigProfile)
        .filter(
            and_(
                ModelConfigProfile.user_id == user_id,
                ModelConfigProfile.project_id == project_id,
                ModelConfigProfile.profile_type == profile_type,
            )
        )
        .order_by(ModelConfigProfile.updated_at.desc())
        .all()
    )
    for profile in profiles:
        provider_key = normalize_provider_for_connection_test(profile.provider)
        if not provider_key or provider_key in result:
            continue
        if not _profile_key_is_usable(provider_key, profile.api_key):
            continue
        masked = mask_api_key(profile.api_key)
        if masked:
            result[provider_key] = masked

    active_family = normalize_provider_for_connection_test(active_provider)
    if active_family and _profile_key_is_usable(active_family, active_api_key):
        masked = mask_api_key(active_api_key)
        if masked:
            result[active_family] = masked

    return result
