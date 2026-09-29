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

HOSTED_PROVIDERS = ("openai", "anthropic", "mistral", "gemini")
SUPPORTED_PROVIDERS = HOSTED_PROVIDERS + ("ollama",)
CHAT_ONLY_PROVIDERS = ("anthropic",)

# No longer configurable; cleared on save so providers fall back to their own defaults.
RETIRED_PARAM_FIELDS = ("top_p", "best_of", "frequency_penalty", "presence_penalty")


class ProviderConfigError(ValueError):
    """Invalid provider configuration input (maps to HTTP 400)."""


def normalize_provider(provider: Optional[str]) -> str:
    key = normalize_provider_for_connection_test(provider)
    if key not in SUPPORTED_PROVIDERS:
        raise ProviderConfigError(f"Unsupported provider: {provider}")
    return key


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


def is_configured(row: Optional[ProjectModelProvider]) -> bool:
    """Configured = has a chat model and (for hosted providers) a stored key the provider accepts."""
    if not row or not (row.chat_model or "").strip():
        return False
    if row.provider == "ollama":
        return True
    return has_usable_key(row) and not is_key_rejected(row)


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
        "temperature": row.temperature if row else None,
        "surfaces": serialize_surface_tuning(row),
        "last_test_status": row.last_test_status if row else None,
        "last_test_message": row.last_test_message if row else None,
        "last_tested_at": row.last_tested_at.isoformat() if row and row.last_tested_at else None,
        "updated_at": row.updated_at.isoformat() if row and row.updated_at else None,
    }


def _live_chat_models(provider: str, row: Optional[ProjectModelProvider]) -> List[str]:
    try:
        if provider == "ollama":
            return list_live_chat_models_for_provider(provider)
        if has_usable_key(row):
            return list_live_chat_models_for_provider(provider, api_key=row.api_key)
    except Exception:
        return []
    return []


def build_providers_payload(db: Session, project_id: uuid.UUID, *, include_live: bool = True) -> Dict[str, Any]:
    """Catalog (curated + live + selected models) merged with each provider's saved config."""
    configs = list_provider_configs(db, project_id)
    enrichments: Dict[str, Dict[str, Any]] = {}
    for provider in SUPPORTED_PROVIDERS:
        row = configs.get(provider)
        enrichments[provider] = {
            "live_chat": _live_chat_models(provider, row) if include_live else [],
            "live_embedding": [],
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
) -> Dict[str, str]:
    """Probe chat/embedding with the typed key or the stored one; record result on the row."""
    provider = normalize_provider(provider)
    row = get_provider_config(db, project_id, provider)
    stored_key = row.api_key if row else None
    if provider in CHAT_ONLY_PROVIDERS:
        embedding_model = None

    resolved_key, failure = resolve_usable_api_key_for_connection_test(provider, api_key, stored_key)
    if failure:
        results = {"chat_model": failure}
        if embedding_model:
            results["embedding_model"] = failure
    else:
        results = await probe_provider_models(
            provider,
            chat_model=chat_model,
            embedding_model=embedding_model,
            api_key=resolved_key,
        )

    typed_key = (api_key or "").strip()
    tested_stored_key = not typed_key or is_masked_api_key(typed_key)
    if row is not None and tested_stored_key and results:
        row.last_test_status = "success" if is_probe_success(results) else "failed"
        row.last_test_message = summarize_results(results)
        row.last_tested_at = datetime.now(timezone.utc)
        db.commit()
    return results
