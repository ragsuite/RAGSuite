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
from .model_connection_probe import collect_extra_models, is_probe_success, probe_provider_models
from .project_model_provider_verification import is_key_rejected, summarize_results

HOSTED_PROVIDERS = ("openai", "azure_openai", "anthropic", "mistral", "gemini")
SUPPORTED_PROVIDERS = HOSTED_PROVIDERS + ("ollama",)
CHAT_ONLY_PROVIDERS = ("anthropic",)
# Providers that require a resource endpoint URL in addition to an API key.
ENDPOINT_REQUIRED_PROVIDERS = ("azure_openai",)

# No longer configurable; cleared on save so providers fall back to their own defaults.
RETIRED_PARAM_FIELDS = ("top_p", "best_of", "frequency_penalty", "presence_penalty")
EXTRA_MODEL_FIELDS = ("asr_model", "tts_model", "rerank_model", "ocr_model")
EXTRA_MODEL_KINDS = ("asr", "rerank", "tts", "ocr")


class ProviderConfigError(ValueError):
    """Invalid provider configuration input (maps to HTTP 400)."""


def normalize_provider(provider: Optional[str]) -> str:
    from .provider_marketplace import catalog_id, is_openai_compatible

    raw = (provider or "").strip().lower()
    if raw == "openai_compatible" or raw.startswith("openai_compatible") or is_openai_compatible(raw):
        key = catalog_id(raw) if is_openai_compatible(raw) else catalog_id(raw)
        if key == "openai_compatible":
            raise ProviderConfigError("Choose a marketplace provider, not the openai_compatible adapter")
        if is_openai_compatible(key):
            return key
    key = normalize_provider_for_connection_test(provider)
    if key not in SUPPORTED_PROVIDERS:
        if is_openai_compatible(key):
            return catalog_id(key)
        raise ProviderConfigError(f"Unsupported provider: {provider}")
    return key


def normalize_provider_endpoint(provider: str, raw: Optional[str], *, required: bool = False) -> Optional[str]:
    """Normalize resource URL; require http(s) when provider needs an endpoint.

    OpenAI-compatible marketplace providers may store an optional custom base URL.

    For Azure, keep only ``scheme://host`` so paste of Foundry ``/models`` paths or
    full ``/openai/deployments/.../chat/completions?...`` URLs still resolve to the
    resource base used by the SDK and listing helpers.
    """
    value = (raw or "").strip()
    from .provider_marketplace import is_openai_compatible

    if provider not in ENDPOINT_REQUIRED_PROVIDERS and not is_openai_compatible(provider):
        return value.rstrip("/") or None
    if provider not in ENDPOINT_REQUIRED_PROVIDERS and is_openai_compatible(provider):
        if not value:
            return None
        if not (value.startswith("https://") or value.startswith("http://")):
            raise ProviderConfigError("Endpoint must be an http(s) URL")
        return value.rstrip("/")
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


def _has_selected_model(row: Optional[ProjectModelProvider]) -> bool:
    if row is None:
        return False
    fields = ("chat_model", "embedding_model") + EXTRA_MODEL_FIELDS
    return any((getattr(row, field, None) or "").strip() for field in fields)


def is_configured(row: Optional[ProjectModelProvider]) -> bool:
    """Configured = has at least one selected model and (for hosted providers) a stored key the provider accepts."""
    if not _has_selected_model(row):
        return False
    if row.provider == "ollama":
        return True
    if not has_usable_endpoint(row):
        return False
    return has_usable_key(row) and not is_key_rejected(row)


def resolve_provider_endpoint(db: Session, project_id: uuid.UUID, provider: Optional[str]) -> Optional[str]:
    """Live-read endpoint from project_model_providers (Azure OpenAI / OpenAI-compatible)."""
    from .provider_marketplace import default_base_url, is_openai_compatible

    try:
        key = normalize_provider(provider)
    except ProviderConfigError:
        return None
    row = get_provider_config(db, project_id, key)
    endpoint = (row.endpoint or "").strip() if row else ""
    if endpoint:
        return endpoint
    if is_openai_compatible(key):
        return default_base_url(key)
    if key not in ENDPOINT_REQUIRED_PROVIDERS:
        return None
    return None


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
        "asr_model": row.asr_model if row else None,
        "tts_model": row.tts_model if row else None,
        "rerank_model": row.rerank_model if row else None,
        "ocr_model": row.ocr_model if row else None,
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


def _named_models(model_ids: List[str]) -> List[Dict[str, str]]:
    return [{"name": model_id, "value": model_id} for model_id in model_ids if model_id]


def _live_classified_models(provider: str, row: Optional[ProjectModelProvider]) -> Dict[str, List[str]]:
    from ..utils.provider_model_discovery import classify_live_model_ids, list_openai_compatible_model_ids
    from .provider_factories import KIND_ORDER
    from .provider_marketplace import default_base_url, is_openai_compatible

    empty = {kind: [] for kind in KIND_ORDER}
    try:
        if provider == "openai" and has_usable_key(row):
            ids = list_openai_compatible_model_ids(api_key=row.api_key, base_url="https://api.openai.com/v1")
            classified = classify_live_model_ids(ids)
            classified["chat"] = _live_chat_models(provider, row) or classified.get("chat") or []
            classified["embedding"] = _live_embedding_models(provider, row) or classified.get("embedding") or []
            return classified
        if is_openai_compatible(provider) and has_usable_key(row):
            base = (row.endpoint if row else None) or default_base_url(provider) or ""
            return classify_live_model_ids(list_openai_compatible_model_ids(api_key=row.api_key, base_url=base))
        if provider in ENDPOINT_REQUIRED_PROVIDERS:
            return {
                **empty,
                "chat": _live_chat_models(provider, row),
                "embedding": _live_embedding_models(provider, row),
            }
        if provider == "ollama":
            return {**empty, "chat": _live_chat_models(provider, row)}
        if has_usable_key(row):
            return {**empty, "chat": _live_chat_models(provider, row)}
    except Exception:
        return empty
    return empty


def _kind_models_payload(
    curated: List[str],
    live: List[str],
    selected: Optional[str],
) -> List[Dict[str, str]]:
    from .provider_factories import merge_model_ids

    return _named_models(merge_model_ids(curated, live, [selected] if selected else []))


def build_providers_payload(db: Session, project_id: uuid.UUID, *, include_live: bool = False) -> Dict[str, Any]:
    """Catalog (curated + optional live + selected models) merged with each provider's saved config."""
    from .provider_marketplace import extra_providers, is_chat_only, kinds_for, models_for

    configs = list_provider_configs(db, project_id)
    enrichments: Dict[str, Dict[str, Any]] = {}
    live_by_provider: Dict[str, Dict[str, List[str]]] = {}
    for provider in SUPPORTED_PROVIDERS:
        row = configs.get(provider)
        live_by_provider[provider] = _live_classified_models(provider, row) if include_live else {}
        enrichments[provider] = {
            "live_chat": live_by_provider[provider].get("chat") or [],
            "live_embedding": live_by_provider[provider].get("embedding") or [],
            "selected_chat": (row.chat_model or None) if row else None,
            "selected_embedding": (row.embedding_model or None) if row else None,
        }
    catalog = build_available_providers_payload(enrichments=enrichments)
    from .provider_marketplace import catalog_entry

    providers = []
    for entry in catalog:
        provider = entry["value"]
        row = configs.get(provider)
        live = live_by_provider.get(provider) or {}
        meta = catalog_entry(provider) or {}
        payload = {
            **entry,
            "adapter": "native",
            "kinds": kinds_for(provider) or (["chat"] if provider == "anthropic" else ["chat", "embedding"]),
            "config": serialize_provider_config(row, provider),
        }
        if meta.get("docs_url"):
            payload["docs_url"] = meta["docs_url"]
        for kind in EXTRA_MODEL_KINDS:
            selected = getattr(row, f"{kind}_model", None) if row else None
            payload[f"{kind}_models"] = _kind_models_payload(
                models_for(provider, kind), live.get(kind) or [], selected
            )
        providers.append(payload)

    seen = {p["value"] for p in providers}
    for extra in extra_providers():
        provider = str(extra.get("id") or "")
        if not provider or provider in seen:
            continue
        row = configs.get(provider)
        live = _live_classified_models(provider, row) if include_live else {}
        chat_models = _kind_models_payload(
            extra.get("chat_models") or [], live.get("chat") or [], row.chat_model if row else None
        )
        embedding_models = (
            []
            if is_chat_only(provider)
            else _kind_models_payload(
                extra.get("embedding_models") or [],
                live.get("embedding") or [],
                row.embedding_model if row else None,
            )
        )
        payload = {
            "provider": extra.get("label") or provider,
            "value": provider,
            "adapter": "openai_compatible",
            "kinds": list(extra.get("kinds") or ["chat"]),
            "chat_models": chat_models,
            "embedding_models": embedding_models,
            "default_base_url": extra.get("default_base_url"),
            "docs_url": extra.get("docs_url"),
            "config": serialize_provider_config(row, provider),
        }
        for kind in EXTRA_MODEL_KINDS:
            selected = getattr(row, f"{kind}_model", None) if row else None
            payload[f"{kind}_models"] = _kind_models_payload(
                extra.get(f"{kind}_models") or [], live.get(kind) or [], selected
            )
        providers.append(payload)
        seen.add(provider)
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


def _probe_preflight_results(
    *,
    chat_model: Optional[str],
    embedding_model: Optional[str],
    failure: str,
) -> Dict[str, str]:
    if (chat_model or "").strip():
        results = {"chat_model": failure}
        if (embedding_model or "").strip():
            results["embedding_model"] = failure
        return results
    return {"credentials": failure}


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
    asr_model: Optional[str] = None,
    tts_model: Optional[str] = None,
    rerank_model: Optional[str] = None,
    ocr_model: Optional[str] = None,
) -> Dict[str, str]:
    """Probe chat/embedding or extra-only credentials; record result on the row."""
    provider = normalize_provider(provider)
    row = get_provider_config(db, project_id, provider)
    stored_key = row.api_key if row else None
    from .provider_marketplace import is_chat_only

    if provider in CHAT_ONLY_PROVIDERS or is_chat_only(provider):
        embedding_model = None

    extra_models = collect_extra_models(
        asr_model=asr_model,
        tts_model=tts_model,
        rerank_model=rerank_model,
        ocr_model=ocr_model,
    )

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
        results = _probe_preflight_results(
            chat_model=chat_model, embedding_model=embedding_model, failure=failure
        )
    elif provider in ENDPOINT_REQUIRED_PROVIDERS and not resolved_endpoint:
        msg = "Failed: Endpoint is required for Azure OpenAI."
        results = _probe_preflight_results(
            chat_model=chat_model, embedding_model=embedding_model, failure=msg
        )
    else:
        results = await probe_provider_models(
            provider,
            chat_model=chat_model,
            embedding_model=embedding_model,
            api_key=resolved_key,
            endpoint=resolved_endpoint,
            api_version=resolved_api_version,
            extra_models=extra_models,
        )

    typed_key = (api_key or "").strip()
    tested_stored_key = not typed_key or is_masked_api_key(typed_key)
    if row is not None and tested_stored_key and results:
        row.last_test_status = "success" if is_probe_success(results) else "failed"
        row.last_test_message = summarize_results(results)
        row.last_tested_at = datetime.now(timezone.utc)
        db.commit()
    return results
