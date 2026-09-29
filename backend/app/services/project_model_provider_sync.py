"""Keep chatbot / search settings rows in sync with project provider configs.

Widgets pick a configured provider; chat model, embedding model and API key come
from ``project_model_providers``, as do the model-specific per-surface tuning
values (temperature, similarity threshold, max tokens), which only Model
Configuration edits. Top K, reranker and response type stay per widget.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, Literal, Optional

from sqlalchemy.orm import Session

from ..models import ChatbotSettings, ProjectModelProvider, SearchSettings
from ..utils.api_key import normalize_provider_for_connection_test
from .project_model_providers import (
    RETIRED_PARAM_FIELDS,
    SUPPORTED_PROVIDERS,
    get_provider_config,
    is_configured,
)
from .project_model_provider_tuning import surface_tuning_columns, surface_tuning_values

logger = logging.getLogger(__name__)

Surface = Literal["chat", "search"]

_SURFACE_FIELDS: Dict[Surface, Dict[str, str]] = {
    "chat": {"chat_model": "chat_model"},
    "search": {"chat_model": "search_model"},
}

# Retired tuning params; cleared so widgets stop sending values nobody can see or edit.
_RETIRED_SURFACE_FIELDS: Dict[Surface, tuple[str, ...]] = {
    surface: tuple(f"{surface}_{name}" for name in RETIRED_PARAM_FIELDS) for surface in ("chat", "search")
}


def provider_settings_values(row: ProjectModelProvider, surface: Surface) -> Dict[str, Any]:
    """Settings-row column values derived from a provider config."""
    values: Dict[str, Any] = {"model_provider": row.provider}
    for source, target in _SURFACE_FIELDS[surface].items():
        value = getattr(row, source)
        if value is not None:
            values[target] = value
    values.update(surface_tuning_values(row, surface))
    values.update(dict.fromkeys(_RETIRED_SURFACE_FIELDS[surface]))
    if row.embedding_model:
        values["embedding_model"] = row.embedding_model
    # Ollama keeps the route-level static key handling.
    if row.provider != "ollama" and row.api_key:
        values["api_key"] = row.api_key
    return values


def configured_provider_for(db: Session, project_id: Any, provider: Optional[str]) -> Optional[ProjectModelProvider]:
    key = normalize_provider_for_connection_test(provider)
    if key not in SUPPORTED_PROVIDERS:
        return None
    row = get_provider_config(db, project_id, key)
    return row if is_configured(row) else None


def fill_update_from_project_provider(
    db: Session,
    project_id: Any,
    update_data: Dict[str, Any],
    surface: Surface,
) -> bool:
    """Overwrite model/key/param fields in a widget update with the project provider config.

    Tuning is edited only in Model Configuration: widget-sent values are dropped, so
    the provider value wins and a provider without one leaves the stored widget value.
    Returns False (update untouched) when the requested provider is not configured,
    so legacy clients that send full model settings keep working.
    """
    row = configured_provider_for(db, project_id, update_data.get("model_provider"))
    if row is None:
        return False
    for column in surface_tuning_columns(surface):
        update_data.pop(column, None)
    update_data.update(provider_settings_values(row, surface))
    return True


def _apply(settings_row: Any, values: Dict[str, Any]) -> bool:
    changed = False
    for key, value in values.items():
        if getattr(settings_row, key) != value:
            setattr(settings_row, key, value)
            changed = True
    return changed


def propagate_provider_to_settings(db: Session, project_id: uuid.UUID, provider: str) -> Dict[str, int]:
    """Push a saved provider config into every settings row in the project that uses it."""
    row = configured_provider_for(db, project_id, provider)
    counts = {"chat": 0, "search": 0}
    if row is None:
        return counts

    touched: list[tuple[Surface, Any]] = []
    embedding_changed = False
    for surface, model in (("chat", ChatbotSettings), ("search", SearchSettings)):
        values = provider_settings_values(row, surface)
        for settings_row in db.query(model).filter(model.project_id == project_id).all():
            if normalize_provider_for_connection_test(settings_row.model_provider) != row.provider:
                continue
            before_embedding = settings_row.embedding_model
            if _apply(settings_row, values):
                counts[surface] += 1
                touched.append((surface, settings_row))
                embedding_changed = embedding_changed or before_embedding != settings_row.embedding_model
    if not touched:
        return counts

    db.commit()
    if embedding_changed:
        _invalidate_embedding_caches(str(project_id))
    _sync_compare_profiles(db, touched)
    return counts


def _invalidate_embedding_caches(project_id: str) -> None:
    from ..routes.embeddings import invalidate_embedding_status_cache
    from .reindex_service import invalidate_item_embedding_coverage_cache

    invalidate_item_embedding_coverage_cache(project_id)
    invalidate_embedding_status_cache(project_id)


def _sync_compare_profiles(db: Session, touched: list[tuple[Surface, Any]]) -> None:
    """Reuse the widget routes' profile upserts so Compare Models sees the new keys."""
    from ..routes.chat_models import _upsert_chat_model_config_profile
    from ..routes.search_models import _upsert_model_config_profile

    for surface, settings_row in touched:
        try:
            if surface == "chat":
                _upsert_chat_model_config_profile(db, settings_row.user_id, settings_row)
            else:
                _upsert_model_config_profile(db, settings_row.user_id, settings_row)
        except Exception as exc:  # profile cache is best-effort; settings rows are the source
            logger.warning("Model profile sync failed for %s settings %s: %s", surface, settings_row.id, exc)
