"""Crawl ingest targets bound to a Model Configuration provider instead of a widget surface.

A crawl source may store a provider key (``openai`` / ``mistral`` / ``gemini`` / ``ollama``)
in ``ingest_embedding_target``. The provider's *current* embedding model is resolved at
crawl time, so changing it in Model Configuration is picked up on the next crawl.
When the provider is no longer configured (removed, rejected key, no embedding model)
the source resolves to no targets and indexing pauses without touching existing vectors.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Mapping, Optional, Tuple

from sqlalchemy.orm import Session

from ..models import CrawlSource, ProjectModelProvider
from ..utils.llm_model_catalogs import build_available_providers_payload
from .project_model_providers import (
    CHAT_ONLY_PROVIDERS,
    SUPPORTED_PROVIDERS,
    get_provider_config,
    is_configured,
    list_provider_configs,
)
from .rag.embedder_factory import collection_name_for, resolve_embedding
from .rag.embedding_resolver import (
    IngestEmbeddingTarget,
    Source,
    preferred_ingest_source,
    resolve_for_project,
)

PROVIDER_INGEST_TARGETS: Tuple[str, ...] = tuple(
    p for p in SUPPORTED_PROVIDERS if p not in CHAT_ONLY_PROVIDERS
)
_SURFACES: Tuple[Source, ...] = ("search", "chat")


def normalize_ingest_target(value: Any) -> str:
    raw = getattr(value, "value", value)
    return (str(raw) if raw is not None else "").strip().lower()


def is_provider_target(value: Any) -> bool:
    return normalize_ingest_target(value) in PROVIDER_INGEST_TARGETS


def _to_uuid(project_id) -> Optional[uuid.UUID]:
    if project_id is None:
        return None
    if isinstance(project_id, uuid.UUID):
        return project_id
    try:
        return uuid.UUID(str(project_id))
    except (TypeError, ValueError):
        return None


def _provider_labels() -> Dict[str, str]:
    return {str(e["value"]): str(e["provider"]) for e in build_available_providers_payload()}


def ingest_provider_labels() -> Dict[str, str]:
    """Display names for every provider a crawl source may store (incl. unconfigured ones)."""
    labels = _provider_labels()
    return {key: labels.get(key, key) for key in PROVIDER_INGEST_TARGETS}


def _resolve_usable(
    project_id: uuid.UUID,
    row: Optional[ProjectModelProvider],
) -> Optional[Tuple[str, str, Optional[str], str, Optional[str], Optional[str]]]:
    """``(provider, model, api_key, collection, endpoint, api_version)`` or None when the row cannot embed."""
    if row is None or not is_configured(row):
        return None
    if not (row.embedding_model or "").strip():
        return None
    provider, model, api_key = resolve_embedding(row.provider, row.embedding_model, row.api_key)
    # resolve_embedding falls back to Jina/Ollama for unusable hosted rows; that is not this provider.
    if provider != row.provider:
        return None
    endpoint = (row.endpoint or "").strip().rstrip("/") or None
    api_version = (row.api_version or "").strip() or None
    return (
        provider,
        model,
        api_key,
        collection_name_for(project_id, provider, model),
        endpoint,
        api_version,
    )


def surface_collections(db: Session, project_id) -> Dict[Source, str]:
    """Collection each widget surface (Search / Chatbot) currently retrieves from."""
    out: Dict[Source, str] = {}
    for surface in _SURFACES:
        provider, model, _ = resolve_for_project(
            db, project_id, source=surface, honor_requested_source=True
        )
        out[surface] = collection_name_for(project_id, provider, model)
    return out


def surfaces_for_collection(collection: str, surfaces: Mapping[str, str]) -> List[Source]:
    return [s for s in _SURFACES if collection and surfaces.get(s) == collection]


def _primary_surface(used_by: List[Source]) -> Optional[Source]:
    if not used_by:
        return None
    preferred = preferred_ingest_source()
    return preferred if preferred in used_by else used_by[0]


def resolve_provider_ingest_target(
    db: Session,
    project_id,
    provider: Any,
    *,
    surfaces: Optional[Mapping[str, str]] = None,
) -> Optional[IngestEmbeddingTarget]:
    """Current embedding destination for a provider-key target, or None when unavailable."""
    key = normalize_ingest_target(provider)
    pid = _to_uuid(project_id)
    if key not in PROVIDER_INGEST_TARGETS or pid is None:
        return None
    resolved = _resolve_usable(pid, get_provider_config(db, pid, key))
    if resolved is None:
        return None
    resolved_provider, model, api_key, collection, endpoint, api_version = resolved
    if surfaces is None:
        surfaces = surface_collections(db, pid)
    return IngestEmbeddingTarget(
        source=_primary_surface(surfaces_for_collection(collection, surfaces)),
        provider=resolved_provider,
        model=model,
        api_key=api_key,
        collection=collection,
        endpoint=endpoint,
        api_version=api_version,
    )


def list_embedding_provider_options(
    db: Session,
    project_id,
    *,
    surfaces: Optional[Mapping[str, str]] = None,
) -> List[Dict[str, Any]]:
    """Configured providers that can embed, in Model Configuration order."""
    pid = _to_uuid(project_id)
    if pid is None:
        return []
    configs = list_provider_configs(db, pid)
    labels = _provider_labels()
    if surfaces is None:
        surfaces = surface_collections(db, pid)
    options: List[Dict[str, Any]] = []
    for key in PROVIDER_INGEST_TARGETS:
        resolved = _resolve_usable(pid, configs.get(key))
        if resolved is None:
            continue
        _, model, _, collection, _endpoint, _api_version = resolved
        options.append(
            {
                "provider": key,
                "label": labels.get(key, key),
                "model": model,
                "collection": collection,
                "used_by": surfaces_for_collection(collection, surfaces),
            }
        )
    return options


def default_provider_option(options: List[Dict[str, Any]]) -> Optional[str]:
    """Provider behind the preferred ingest surface, else any widget-backed one, else the first."""
    preferred = preferred_ingest_source()
    for option in options:
        if preferred in option["used_by"]:
            return option["provider"]
    for option in options:
        if option["used_by"]:
            return option["provider"]
    return options[0]["provider"] if options else None


def _provider_not_usable_detail(provider: str) -> str:
    label = _provider_labels().get(provider, provider or "The provider")
    return (
        f"{label} is not configured with a working API key and embedding model "
        "in Model Configuration."
    )


def _unusable_provider_target(db: Session, project_id, target: Any) -> Optional[str]:
    """Provider key when ``target`` names a provider that cannot embed right now."""
    key = normalize_ingest_target(target)
    pid = _to_uuid(project_id)
    if key not in PROVIDER_INGEST_TARGETS or pid is None:
        return None
    if _resolve_usable(pid, get_provider_config(db, pid, key)) is not None:
        return None
    return key


def provider_target_selection_error(db: Session, project_id, target: Any) -> Optional[str]:
    """Create/update validation message for an unusable provider key; None otherwise."""
    key = _unusable_provider_target(db, project_id, target)
    if key is None:
        return None
    return f"{_provider_not_usable_detail(key)} Choose a configured provider."


def crawl_source_unavailable_reason(db: Session, source: CrawlSource) -> Optional[str]:
    """Paused-indexing message for a source whose provider can no longer embed."""
    key = _unusable_provider_target(
        db, source.project_id, getattr(source, "ingest_embedding_target", None)
    )
    if key is None:
        return None
    return (
        f"Indexing paused: {_provider_not_usable_detail(key)} "
        "Edit the source and choose another provider."
    )
