"""Helpers to resolve the embedding (provider, model, api_key) for a project.

Interactive search queries use `SearchSettings`; chat queries use `ChatbotSettings`.
**Ingest** paths (crawl, upload, Gmail, ClickUp, data-folder) follow
``EMBEDDING_PREFERRED_SOURCE`` from ``.env`` (default ``search``).

When the project has nothing configured (or saves an invalid combination), we
fall back to Jina/Ollama via ``embedder_factory.resolve_embedding``.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from typing import List, Literal, Optional, Tuple

from sqlalchemy.orm import Session

from ...models import ChatbotSettings, SearchSettings
from ...settings import settings
from .embedder_factory import (
    JINA_FALLBACK_MODEL,
    JINA_FALLBACK_PROVIDER,
    _HOSTED_EMBEDDING_PROVIDERS,
    _normalize_provider,
    collection_name_for,
    get_embedding_meta,
    get_raw_embedder,
    resolve_embedding,
    usable_api_key_for_provider,
)

logger = logging.getLogger(__name__)

Source = Literal["search", "chat"]


@dataclass(frozen=True)
class IngestEmbeddingTarget:
    """One embedding destination for upload/crawl ingest."""

    source: Source
    provider: str
    model: str
    api_key: Optional[str]
    collection: str


def _to_uuid(project_id) -> Optional[uuid.UUID]:
    if project_id is None:
        return None
    if isinstance(project_id, uuid.UUID):
        return project_id
    try:
        return uuid.UUID(str(project_id))
    except (ValueError, TypeError):
        return None


def _read_search_settings(db: Session, project_id) -> Optional[SearchSettings]:
    pid = _to_uuid(project_id)
    if pid is None:
        return None
    return db.query(SearchSettings).filter(SearchSettings.project_id == pid).first()


def _read_chatbot_settings(db: Session, project_id) -> Optional[ChatbotSettings]:
    pid = _to_uuid(project_id)
    if pid is None:
        return None
    return db.query(ChatbotSettings).filter(ChatbotSettings.project_id == pid).first()


def describe_saved_embedding_settings(
    db: Session,
    project_id,
    source: Source,
) -> Tuple[str, str, bool]:
    """Return ``(saved_provider, saved_model, api_key_configured)`` for status banners.

    ``api_key_configured`` is True when a usable key exists for a hosted provider.
    For intentional Ollama/local (no key required) it is True so the UI does not
    scare the user into re-entering a key.
    """
    if source == "chat":
        row = _read_chatbot_settings(db, project_id)
    else:
        row = _read_search_settings(db, project_id)
    if not row:
        return "", "", False

    saved_provider = _normalize_provider(getattr(row, "model_provider", None))
    saved_model = (getattr(row, "embedding_model", None) or "").strip()
    raw_key = getattr(row, "api_key", None)

    if not saved_provider or saved_provider == "ollama":
        # Local/Ollama does not require a hosted API key.
        return saved_provider or "ollama", saved_model, True

    if saved_provider in _HOSTED_EMBEDDING_PROVIDERS:
        return saved_provider, saved_model, usable_api_key_for_provider(saved_provider, raw_key) is not None

    return saved_provider, saved_model, usable_api_key_for_provider(saved_provider, raw_key) is not None


def resolve_for_project(
    db: Session,
    project_id,
    source: Source = "search",
    *,
    honor_requested_source: bool = True,
) -> Tuple[str, str, Optional[str]]:
    """Look up the project's stored embedding selection and normalize it.

    Returns `(provider, model, api_key)`. When the project has no settings or
    saves an unusable combo, returns the Jina/Ollama fallback.

    By default the requested ``source`` (chat vs search) is honored. Pass
    ``honor_requested_source=False`` to force ``settings.embedding_preferred_source``.
    """
    effective_source: Source = (
        source if honor_requested_source else settings.embedding_preferred_source
    )

    if project_id is None:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None

    try:
        if effective_source == "chat":
            row = _read_chatbot_settings(db, project_id)
        else:
            row = _read_search_settings(db, project_id)
    except Exception as exc:
        logger.warning(
            "Embedding resolve failed (project=%s source=%s requested=%s): %s — using Jina fallback",
            project_id, effective_source, source, exc,
        )
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None

    if row is None:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL, None

    provider = getattr(row, "model_provider", None)
    model = getattr(row, "embedding_model", None)
    api_key = getattr(row, "api_key", None)
    return resolve_embedding(provider, model, api_key)


def preferred_ingest_source() -> Source:
    """Global ingest embedding source from ``EMBEDDING_PREFERRED_SOURCE`` (``.env``)."""
    src = (settings.embedding_preferred_source or "search").strip().lower()
    return "chat" if src == "chat" else "search"


def resolve_ingest_for_project(
    db: Session,
    project_id,
) -> Tuple[str, str, Optional[str]]:
    """Resolve embeddings for crawl/upload/integration ingest (honors ``EMBEDDING_PREFERRED_SOURCE``)."""
    return resolve_for_project(
        db,
        project_id,
        source=preferred_ingest_source(),
        honor_requested_source=False,
    )


def _ingest_targets_for_sources(
    db: Session,
    project_id,
    sources: tuple[Source, ...],
) -> List[IngestEmbeddingTarget]:
    """Build distinct ingest targets for the given Search/Chat sources."""
    if project_id is None:
        return [
            IngestEmbeddingTarget(
                source="search",
                provider=JINA_FALLBACK_PROVIDER,
                model=JINA_FALLBACK_MODEL,
                api_key=None,
                collection=collection_name_for(None, JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL),
            )
        ]

    preferred = preferred_ingest_source()
    ordered: List[Source] = []
    for src in (preferred,) + sources:
        if src not in ordered:
            ordered.append(src)

    targets: List[IngestEmbeddingTarget] = []
    seen_collections: set[str] = set()
    for src in ordered:
        provider, model, api_key = resolve_for_project(
            db, project_id, source=src, honor_requested_source=True
        )
        collection = collection_name_for(project_id, provider, model)
        if collection in seen_collections:
            continue
        seen_collections.add(collection)
        targets.append(
            IngestEmbeddingTarget(
                source=src,
                provider=provider,
                model=model,
                api_key=api_key,
                collection=collection,
            )
        )
    return targets


def resolve_crawl_ingest_targets(
    db: Session,
    project_id,
    ingest_target: Optional[Literal["search", "chat", "both"]],
) -> List[IngestEmbeddingTarget]:
    """
    Resolve crawl ingest destinations from a per-source target selection.

    ``None`` keeps legacy env-based single-target ingest.
    """
    if ingest_target is None:
        provider, model, api_key = resolve_ingest_for_project(db, project_id)
        src = preferred_ingest_source()
        return [
            IngestEmbeddingTarget(
                source=src,
                provider=provider,
                model=model,
                api_key=api_key,
                collection=collection_name_for(project_id, provider, model),
            )
        ]

    normalized = (ingest_target or "").strip().lower()
    if normalized == "both":
        return _ingest_targets_for_sources(db, project_id, ("search", "chat"))
    if normalized == "chat":
        return _ingest_targets_for_sources(db, project_id, ("chat",))
    return _ingest_targets_for_sources(db, project_id, ("search",))


def resolve_upload_ingest_targets(db: Session, project_id) -> List[IngestEmbeddingTarget]:
    """
    Distinct Search + Chat embedding destinations for document ingest.

    When both surfaces use the same collection, only one ingest target is returned.
    Preferred ingest source (``EMBEDDING_PREFERRED_SOURCE``) is resolved first so its
    API key wins on collection collision — Search and Chat often share provider/model
    but store different keys in the shared ``api_key`` field.
    """
    if project_id is None:
        return [
            IngestEmbeddingTarget(
                source="search",
                provider=JINA_FALLBACK_PROVIDER,
                model=JINA_FALLBACK_MODEL,
                api_key=None,
                collection=collection_name_for(None, JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL),
            )
        ]

    return _ingest_targets_for_sources(db, project_id, ("search", "chat"))


def resolve_reindex_for_project(
    db: Session,
    project_id,
    source: Source = "search",
) -> Tuple[str, str, Optional[str]]:
    """
    Credentials for a Search/Chat reindex run.

    Honors the requested ``source`` for provider/model/collection, but when Search and
    Chat share that collection, uses the preferred ingest source's API key — same rule
    as upload ingest — so a proxy key on Search cannot wipe vectors on Documents reindex.
    """
    requested: Source = "chat" if source == "chat" else "search"
    provider, model, api_key = resolve_for_project(
        db, project_id, source=requested, honor_requested_source=True
    )
    if project_id is None:
        return provider, model, api_key

    collection = collection_name_for(project_id, provider, model)
    preferred = preferred_ingest_source()
    if preferred == requested:
        return provider, model, api_key

    pref_provider, pref_model, pref_key = resolve_for_project(
        db, project_id, source=preferred, honor_requested_source=True
    )
    pref_collection = collection_name_for(project_id, pref_provider, pref_model)
    if pref_collection == collection and pref_key:
        return provider, model, pref_key
    return provider, model, api_key


def saved_embedding_fallback_used(
    db: Session,
    project_id,
    source: Source,
    resolved_provider: str,
    resolved_model: str,
) -> bool:
    """
    True when saved settings were downgraded to the Jina/Ollama default.

    Intentional ``ollama`` + Jina is NOT treated as a fallback (no API key needed).
    """
    if (resolved_provider, resolved_model) != (
        JINA_FALLBACK_PROVIDER,
        JINA_FALLBACK_MODEL,
    ):
        return False

    if source == "chat":
        row = _read_chatbot_settings(db, project_id)
    else:
        row = _read_search_settings(db, project_id)
    if not row:
        return False

    saved_provider = getattr(row, "model_provider", None)
    saved_model = (getattr(row, "embedding_model", None) or "").strip()
    saved_api_key = getattr(row, "api_key", None)
    saved_p = _normalize_provider(saved_provider)

    if saved_p == "ollama" and saved_model == JINA_FALLBACK_MODEL:
        return False

    intended_provider, intended_model, _ = resolve_embedding(
        saved_provider, saved_model, saved_api_key
    )
    return (
        intended_provider == JINA_FALLBACK_PROVIDER
        and intended_model == JINA_FALLBACK_MODEL
        and saved_p != "ollama"
    )


def resolve_context_for_project(
    db: Session,
    project_id,
    source: Source = "search",
):
    """Convenience: returns a dict with the embedder, collection name and meta."""
    provider, model, api_key = resolve_for_project(db, project_id, source=source)
    embedder = get_raw_embedder(provider, model, api_key)
    collection = collection_name_for(project_id, provider, model)
    meta = get_embedding_meta(provider, model)
    return {
        "provider": provider,
        "model": model,
        "api_key": api_key,
        "embedder": embedder,
        "collection": collection,
        "meta": meta,
    }


__all__ = [
    "IngestEmbeddingTarget",
    "preferred_ingest_source",
    "describe_saved_embedding_settings",
    "resolve_for_project",
    "resolve_ingest_for_project",
    "resolve_crawl_ingest_targets",
    "resolve_reindex_for_project",
    "resolve_context_for_project",
    "resolve_upload_ingest_targets",
    "saved_embedding_fallback_used",
    "Source",
]
