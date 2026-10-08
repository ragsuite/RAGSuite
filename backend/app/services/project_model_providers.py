"""Project-wide AI provider configuration (Model Configuration module).

One row per (project, provider family). API keys are stored encrypted and never
returned in plaintext. Saving lives in ``project_model_provider_save``.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from ..models import ProjectModelProvider
from ..utils.api_key import (
    _profile_key_is_usable,
    is_masked_api_key,
    mask_api_key,
    normalize_provider_for_connection_test,
    resolve_usable_api_key_for_connection_test,
)
from ..utils.llm_model_catalogs import build_available_providers_payload
from ..utils.provider_model_discovery import list_live_chat_models_for_provider
from .model_connection_probe import is_probe_success, probe_provider_models
from .project_model_provider_verification import is_key_rejected, summarize_results

HOSTED_PROVIDERS = ("openai", "azure_openai", "anthropic", "mistral", "gemini")
SUPPORTED_PROVIDERS = HOSTED_PROVIDERS + ("ollama",)
CHAT_ONLY_PROVIDERS = ("anthropic",)
# Providers that require a resource endpoint URL in addition to an API key.
ENDPOINT_REQUIRED_PROVIDERS = ("azure_openai",)

# No longer configurable; cleared on save so providers fall back to their own defaults.
RETIRED_PARAM_FIELDS = ("top_p", "best_of", "frequency_penalty", "presence_penalty")


class ProviderConfigError(ValueError):
    """Invalid provider configuration input (maps to HTTP 400)."""


def normalize_provider(provider: Optional[str]) -> str:
    key = normalize_provider_for_connection_test(provider)
    if key not in SUPPORTED_PROVIDERS:
        raise ProviderConfigError(f"Unsupported provider: {provider}")
    return key


def normalize_provider_endpoint(provider: str, raw: Optional[str], *, required: bool = False) -> Optional[str]:
    """Normalize resource URL; require http(s) when provider needs an endpoint.

    For Azure, keep only ``scheme://host`` so paste of Foundry ``/models`` paths or
    full ``/openai/deployments/.../chat/completions?...`` URLs still resolve to the
    resource base used by the SDK and listing helpers.
    """
    value = (raw or "").strip()
    if provider not in ENDPOINT_REQUIRED_PROVIDERS:
        return value.rstrip("/") or None
    if not value:
        if required:
            raise ProviderConfigError("Endpoint is required for Azure OpenAI")
        return None
    if not (value.startswith("https://") or value.startswith("http://")):
        raise ProviderConfigError("Endpoint must be an http(s) URL")
    try:
        from urllib.parse import urlparse

        parsed = urlparse(value)
        if not parsed.scheme or not parsed.netloc:
            raise ProviderConfigError("Endpoint must be an http(s) URL")
        return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")
    except ProviderConfigError:
        raise
    except Exception as exc:
        raise ProviderConfigError(f"Invalid endpoint URL: {exc}") from exc


DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21"


def normalize_azure_api_version(raw: Optional[str]) -> Optional[str]:
    """Strip whitespace; empty → None (caller falls back to env/default)."""
    value = (raw or "").strip()
    return value or None


def azure_openai_api_version(override: Optional[str] = None) -> str:
    """Resolve API version: explicit override → env → default."""
    import os

    if (override or "").strip():
        return (override or "").strip()
    raw = (os.getenv("AZURE_OPENAI_API_VERSION") or DEFAULT_AZURE_OPENAI_API_VERSION).strip()
    return raw or DEFAULT_AZURE_OPENAI_API_VERSION


def get_provider_config(db: Session, project_id: uuid.UUID, provider: str) -> Optional[ProjectModelProvider]:
    return (
        db.query(ProjectModelProvider)
        .filter(
            ProjectModelProvider.project_id == project_id,
            ProjectModelProvider.provider == provider,
        )
        .first()
    )


def list_provider_configs(db: Session, project_id: uuid.UUID) -> Dict[str, ProjectModelProvider]:
    rows = db.query(ProjectModelProvider).filter(ProjectModelProvider.project_id == project_id).all()
    return {row.provider: row for row in rows}


def has_usable_key(row: Optional[ProjectModelProvider]) -> bool:
    return bool(row) and _profile_key_is_usable(row.provider, row.api_key)


def has_usable_endpoint(row: Optional[ProjectModelProvider]) -> bool:
    if row is None or row.provider not in ENDPOINT_REQUIRED_PROVIDERS:
        return True
    return bool((row.endpoint or "").strip())


def is_configured(row: Optional[ProjectModelProvider]) -> bool:
    """Configured = has a chat model and (for hosted providers) a stored key the provider accepts."""
    if not row or not (row.chat_model or "").strip():
        return False
    if row.provider == "ollama":
        return True
    if not has_usable_endpoint(row):
        return False
    return has_usable_key(row) and not is_key_rejected(row)


def resolve_provider_endpoint(db: Session, project_id: uuid.UUID, provider: Optional[str]) -> Optional[str]:
    """Live-read endpoint from project_model_providers (Azure OpenAI). Other providers → None."""
    try:
        key = normalize_provider(provider)
    except ProviderConfigError:
        return None
    if key not in ENDPOINT_REQUIRED_PROVIDERS:
        return None
    row = get_provider_config(db, project_id, key)
    endpoint = (row.endpoint or "").strip() if row else ""
    return endpoint or None


def resolve_provider_api_version(db: Session, project_id: uuid.UUID, provider: Optional[str]) -> Optional[str]:
    """Live-read resolved Azure API version for llm_config. Other providers → None."""
    try:
        key = normalize_provider(provider)
    except ProviderConfigError:
        return None
    if key not in ENDPOINT_REQUIRED_PROVIDERS:
        return None
    row = get_provider_config(db, project_id, key)
    override = normalize_azure_api_version(row.api_version if row else None)
    return azure_openai_api_version(override)


def serialize_provider_config(row: Optional[ProjectModelProvider], provider: str) -> Dict[str, Any]:
    from .project_model_provider_tuning import serialize_surface_tuning

    key_saved = has_usable_key(row)
    return {
        "provider": provider,
        "configured": is_configured(row),
        "has_api_key": key_saved,
        "key_rejected": key_saved and is_key_rejected(row),
        "api_key_masked": mask_api_key(row.api_key) if row and key_saved else None,
        "chat_model": row.chat_model if row else None,
        "embedding_model": row.embedding_model if row else None,
        "endpoint": (row.endpoint or None) if row else None,
        "api_version": normalize_azure_api_version(row.api_version) if row else None,
        "temperature": row.temperature if row else None,
        "surfaces": serialize_surface_tuning(row),
        "last_test_status": row.last_test_status if row else None,
        "last_test_message": row.last_test_message if row else None,
        "last_tested_at": row.last_tested_at.isoformat() if row and row.last_tested_at else None,
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


def _azure_live_kwargs(row: Optional[ProjectModelProvider]) -> Dict[str, Any]:
    if not row:
        return {}
    endpoint = (row.endpoint or "").strip().rstrip("/") or None
    return {
        "endpoint": endpoint,
        "api_version": azure_openai_api_version(normalize_azure_api_version(row.api_version)),
    }


def _live_chat_models(provider: str, row: Optional[ProjectModelProvider]) -> List[str]:
    try:
        if provider == "ollama":
            return list_live_chat_models_for_provider(provider)
        if has_usable_key(row):
            kwargs: Dict[str, Any] = {"api_key": row.api_key}
            if provider in ENDPOINT_REQUIRED_PROVIDERS:
                kwargs.update(_azure_live_kwargs(row))
            return list_live_chat_models_for_provider(provider, **kwargs)
    except Exception:
        return []
    return []


def _live_embedding_models(provider: str, row: Optional[ProjectModelProvider]) -> List[str]:
    if provider not in ENDPOINT_REQUIRED_PROVIDERS:
        return []
    try:
        from ..utils.provider_model_discovery import list_live_embedding_models_for_provider

        if has_usable_key(row) and has_usable_endpoint(row):
            return list_live_embedding_models_for_provider(
                provider, api_key=row.api_key, **_azure_live_kwargs(row)
            )
    except Exception:
        return []
    return []


def build_providers_payload(db: Session, project_id: uuid.UUID, *, include_live: bool = False) -> Dict[str, Any]:
    """Catalog (curated + optional live + selected models) merged with each provider's saved config."""
    configs = list_provider_configs(db, project_id)
    enrichments: Dict[str, Dict[str, Any]] = {}
    for provider in SUPPORTED_PROVIDERS:
        row = configs.get(provider)
        enrichments[provider] = {
            "live_chat": _live_chat_models(provider, row) if include_live else [],
            "live_embedding": _live_embedding_models(provider, row) if include_live else [],
            "selected_chat": (row.chat_model or None) if row else None,
            "selected_embedding": (row.embedding_model or None) if row else None,
        }
    catalog = build_available_providers_payload(enrichments=enrichments)
    providers = []
    for entry in catalog:
        provider = entry["value"]
        providers.append({**entry, "config": serialize_provider_config(configs.get(provider), provider)})
    return {
        "providers": providers,
        "configured_count": sum(1 for p in providers if p["config"]["configured"]),
    }


def delete_provider_config(db: Session, project_id: uuid.UUID, provider: str) -> bool:
    row = get_provider_config(db, project_id, normalize_provider(provider))
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


async def test_provider_config(
    db: Session,
    *,
    project_id: uuid.UUID,
    provider: str,
    chat_model: Optional[str],
    embedding_model: Optional[str],
    api_key: Optional[str],
    endpoint: Optional[str] = None,
    api_version: Optional[str] = None,
) -> Dict[str, str]:
    """Probe chat/embedding with the typed key or the stored one; record result on the row."""
    provider = normalize_provider(provider)
    row = get_provider_config(db, project_id, provider)
    stored_key = row.api_key if row else None
    if provider in CHAT_ONLY_PROVIDERS:
        embedding_model = None

    # Soft-fail empty Azure endpoint in probe results (same pattern as missing API key).
    resolved_endpoint = normalize_provider_endpoint(
        provider,
        endpoint if (endpoint or "").strip() else (row.endpoint if row else None),
        required=False,
    )
    version_override = normalize_azure_api_version(api_version)
    if version_override is None and row is not None:
        version_override = normalize_azure_api_version(row.api_version)
    resolved_api_version = (
        azure_openai_api_version(version_override) if provider in ENDPOINT_REQUIRED_PROVIDERS else None
    )

    resolved_key, failure = resolve_usable_api_key_for_connection_test(provider, api_key, stored_key)
    if failure:
        results = {"chat_model": failure}
        if embedding_model:
            results["embedding_model"] = failure
    elif provider in ENDPOINT_REQUIRED_PROVIDERS and not resolved_endpoint:
        msg = "Failed: Endpoint is required for Azure OpenAI."
        results = {"chat_model": msg}
        if embedding_model:
            results["embedding_model"] = msg
    else:
        results = await probe_provider_models(
            provider,
            chat_model=chat_model,
            embedding_model=embedding_model,
            api_key=resolved_key,
            endpoint=resolved_endpoint,
            api_version=resolved_api_version,
        )

    typed_key = (api_key or "").strip()
    tested_stored_key = not typed_key or is_masked_api_key(typed_key)
    if row is not None and tested_stored_key and results:
        row.last_test_status = "success" if is_probe_success(results) else "failed"
        row.last_test_message = summarize_results(results)
        row.last_tested_at = datetime.now(timezone.utc)
        db.commit()
    return results
