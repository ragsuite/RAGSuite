"""Helpers for crawl-source embedding target display and API options."""

from __future__ import annotations

import logging
import uuid
from copy import deepcopy
from typing import Any, Dict, List, Literal, Optional, Set

from sqlalchemy.orm import Session

from ..models import CrawlSource
from .rag.embedding_resolver import (
    IngestEmbeddingTarget,
    preferred_ingest_source,
    resolve_crawl_ingest_targets,
    resolve_for_project,
)
from .rag.embedder_factory import collection_name_for
from .reindex_service import embedded_models_by_item_id

logger = logging.getLogger(__name__)

IngestSurface = Literal["search", "chat"]


def _model_dict_from_target(target: IngestEmbeddingTarget) -> Dict[str, Any]:
    return {
        "provider": target.provider,
        "model": target.model,
        "collection": target.collection,
        "source": target.source,
    }


def configured_crawl_embedding_models(
    db: Session,
    source: CrawlSource,
) -> List[Dict[str, Any]]:
    """Configured ingest models for a crawl source (before/without Chroma coverage)."""
    ingest_target = getattr(source, "ingest_embedding_target", None)
    targets = resolve_crawl_ingest_targets(db, source.project_id, ingest_target)
    return [_model_dict_from_target(t) for t in targets]


def _tag_models_with_ingest_target(
    models: List[Dict[str, Any]],
    ingest_target: str,
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for model in models:
        tagged = dict(model)
        tagged["source"] = ingest_target
        out.append(tagged)
    return out


def _infer_ingest_surface_from_collection(
    db: Session,
    project_id,
    collection: str,
) -> Optional[str]:
    options = build_embedding_target_options(db, project_id)
    if collection == options["search"]["collection"]:
        return "search"
    if collection == options["chat"]["collection"]:
        return "chat"
    return None


def effective_ingest_surface_for_source(
    db: Session,
    source: CrawlSource,
    *,
    embedded_by_id: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> IngestSurface:
    """Resolve which search/chat surface a crawl source belongs to for coverage checks."""
    ingest_target = (getattr(source, "ingest_embedding_target", None) or "").strip().lower()
    if ingest_target == "search":
        return "search"
    if ingest_target == "chat":
        return "chat"
    if ingest_target == "both":
        return preferred_ingest_source()  # type: ignore[return-value]

    sid = str(source.id)
    pid = str(source.project_id)
    coverage = embedded_by_id
    if coverage is None:
        coverage = embedded_models_by_item_id(pid, candidate_ids={sid})
    actual = coverage.get(sid) or []
    if actual:
        primary = actual[0]
        coll = str(primary.get("collection") or "")
        inferred = _infer_ingest_surface_from_collection(db, source.project_id, coll)
        if inferred in ("search", "chat"):
            return inferred  # type: ignore[return-value]
    return preferred_ingest_source()  # type: ignore[return-value]


def crawl_source_expected_for_surface(
    db: Session,
    source: CrawlSource,
    surface: IngestSurface,
    *,
    embedded_by_id: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> bool:
    ingest_target = (getattr(source, "ingest_embedding_target", None) or "").strip().lower()
    if ingest_target == "both":
        return True
    if ingest_target in ("search", "chat"):
        return ingest_target == surface
    return effective_ingest_surface_for_source(
        db, source, embedded_by_id=embedded_by_id
    ) == surface


def crawl_source_ids_expected_for_surface(
    db: Session,
    project_id,
    surface: IngestSurface,
    crawl_source_ids: Set[str],
) -> Set[str]:
    """Crawl source ids that should be embedded in the given search/chat surface."""
    if not crawl_source_ids:
        return set()

    pid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
    sources = (
        db.query(CrawlSource)
        .filter(
            CrawlSource.project_id == pid,
            CrawlSource.id.in_([uuid.UUID(s) for s in crawl_source_ids]),
        )
        .all()
    )
    if not sources:
        return set()

    embedded_by_id = embedded_models_by_item_id(
        str(pid), candidate_ids=set(crawl_source_ids)
    )
    return {
        str(source.id)
        for source in sources
        if crawl_source_expected_for_surface(
            db, source, surface, embedded_by_id=embedded_by_id
        )
    }


def source_has_vectors_in_target_collection(
    db: Session,
    source: CrawlSource,
    *,
    embedded_by_id: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> bool:
    """True when Chroma has vectors for this source in its ingest-target collection(s)."""
    ingest_target = (getattr(source, "ingest_embedding_target", None) or "").strip().lower()
    if ingest_target not in ("search", "chat"):
        return bool(embedded_by_id and embedded_by_id.get(str(source.id)))

    configured = configured_crawl_embedding_models(db, source)
    target_colls = {
        m["collection"]
        for m in configured
        if m.get("source") == ingest_target and m.get("collection")
    }
    if not target_colls:
        return False

    pid = str(source.project_id)
    sid = str(source.id)
    coverage = embedded_by_id
    if coverage is None:
        coverage = embedded_models_by_item_id(pid, candidate_ids={sid})

    actual = coverage.get(sid) or []
    return any(m.get("collection") in target_colls for m in actual)


def indexed_embedding_models_for_sources(
    db: Session,
    project_id,
    sources: List[CrawlSource],
    *,
    embedded_by_id: Optional[Dict[str, List[Dict[str, Any]]]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Return indexed embedding model labels per crawl source id.

    Uses Chroma coverage when available; otherwise falls back to configured targets.
    """
    if not sources:
        return {}

    pid = str(project_id)
    candidate_ids: Set[str] = {str(s.id) for s in sources}
    coverage = embedded_by_id
    if coverage is None:
        coverage = embedded_models_by_item_id(pid, candidate_ids=candidate_ids)

    out: Dict[str, List[Dict[str, Any]]] = {}
    for source in sources:
        sid = str(source.id)
        actual = coverage.get(sid) or []
        configured = configured_crawl_embedding_models(db, source)
        ingest_target = (getattr(source, "ingest_embedding_target", None) or "").strip().lower()

        if ingest_target in ("search", "chat"):
            target_colls = {
                m["collection"]
                for m in configured
                if m.get("source") == ingest_target and m.get("collection")
            }
            actual_filtered = [m for m in actual if m.get("collection") in target_colls]
            if actual_filtered:
                out[sid] = _tag_models_with_ingest_target(actual_filtered, ingest_target)
            else:
                out[sid] = [m for m in configured if m.get("source") == ingest_target]
            continue

        if actual:
            primary = actual[0]
            coll = str(primary.get("collection") or "")
            inferred = _infer_ingest_surface_from_collection(db, project_id, coll)
            if inferred:
                models_for_display = [m for m in actual if m.get("collection") == coll] or [primary]
                out[sid] = _tag_models_with_ingest_target(models_for_display, inferred)
            else:
                out[sid] = actual
            continue
        out[sid] = configured
    return out


def build_embedding_target_options(db: Session, project_id) -> Dict[str, Any]:
    """Search/Chat embedding labels for the Add Source form."""
    search_provider, search_model, _ = resolve_for_project(
        db, project_id, source="search", honor_requested_source=True
    )
    chat_provider, chat_model, _ = resolve_for_project(
        db, project_id, source="chat", honor_requested_source=True
    )
    search_collection = collection_name_for(project_id, search_provider, search_model)
    chat_collection = collection_name_for(project_id, chat_provider, chat_model)
    default_target = preferred_ingest_source()

    return {
        "search": {
            "source": "search",
            "provider": search_provider,
            "model": search_model,
            "collection": search_collection,
        },
        "chat": {
            "source": "chat",
            "provider": chat_provider,
            "model": chat_model,
            "collection": chat_collection,
        },
        "same_collection": search_collection == chat_collection,
        "default_target": default_target,
    }


def should_split_both_crawl_sources(db: Session, project_id) -> bool:
    """True when search and chat resolve to distinct embedding collections."""
    targets = resolve_crawl_ingest_targets(db, project_id, "both")
    return len(targets) >= 2


def crawl_create_ingest_targets(
    db: Session,
    project_id,
    ingest_target: Optional[str],
) -> List[IngestSurface]:
    """
    Resolve which ingest_embedding_target value(s) to persist on create.

    ``both`` with distinct collections becomes two independent single-target sources.
    """
    normalized = (ingest_target or "").strip().lower() if ingest_target else None
    if normalized == "both":
        targets = resolve_crawl_ingest_targets(db, project_id, "both")
        if len(targets) >= 2:
            return [t.source for t in targets]  # type: ignore[misc]
        if len(targets) == 1:
            return [targets[0].source]  # type: ignore[misc]
        return [preferred_ingest_source()]  # type: ignore[return-value]
    if normalized in ("search", "chat"):
        return [normalized]  # type: ignore[list-item]
    return [preferred_ingest_source()]  # type: ignore[return-value]


def clone_crawl_source_for_split(
    source: CrawlSource,
    *,
    ingest_embedding_target: IngestSurface,
) -> CrawlSource:
    """Duplicate crawl config for an independent single-target sibling source."""
    return CrawlSource(
        id=uuid.uuid4(),
        name=source.name,
        base_url=source.base_url,
        depth=source.depth,
        cadence=source.cadence,
        headless=source.headless,
        allowlist=deepcopy(source.allowlist or []),
        denylist=deepcopy(source.denylist or []),
        description=source.description,
        status=source.status,
        is_active=source.is_active,
        max_pages=source.max_pages,
        max_runtime_minutes=source.max_runtime_minutes,
        max_links_per_page=source.max_links_per_page,
        content_length_limit=source.content_length_limit,
        delay_seconds=source.delay_seconds,
        skip_header_footer=source.skip_header_footer,
        rescope_root_links=source.rescope_root_links,
        allow_empty_crawl=source.allow_empty_crawl,
        ingest_embedding_target=ingest_embedding_target,
        created_by_id=source.created_by_id,
        project_id=source.project_id,
        documents_count=0,
        trained_at=None,
        last_crawl_at=None,
    )


def split_legacy_both_crawl_source(
    db: Session,
    source: CrawlSource,
) -> Optional[CrawlSource]:
    """
    Convert a legacy ``both`` crawl source into independent single-target rows.

    Updates ``source`` in place to the first target and returns a new sibling row
    when search/chat collections differ. Returns None when no split is needed.
    """
    if (getattr(source, "ingest_embedding_target", None) or "").lower() != "both":
        return None

    targets = resolve_crawl_ingest_targets(db, source.project_id, "both")
    if len(targets) <= 1:
        source.ingest_embedding_target = targets[0].source if targets else preferred_ingest_source()
        return None

    first, second = targets[0], targets[1]
    source.ingest_embedding_target = first.source
    sibling = clone_crawl_source_for_split(
        source,
        ingest_embedding_target=second.source,  # type: ignore[arg-type]
    )
    db.add(sibling)
    return sibling


def split_all_legacy_both_crawl_sources(db: Session) -> int:
    """Split every crawl source still stored with ingest_embedding_target='both'."""
    rows = (
        db.query(CrawlSource)
        .filter(CrawlSource.ingest_embedding_target == "both")
        .all()
    )
    created = 0
    for source in rows:
        sibling = split_legacy_both_crawl_source(db, source)
        if sibling is not None:
            created += 1
    return created


def purge_stale_crawl_source_embedding_collections(db: Session, source: CrawlSource) -> None:
    """Delete vectors for source.id in collections no longer targeted by ingest_embedding_target."""
    from .rag.singleton import locked_delete_document_embeddings

    sid = str(source.id)
    pid = str(source.project_id)
    ingest_target = getattr(source, "ingest_embedding_target", None)
    targets = resolve_crawl_ingest_targets(db, source.project_id, ingest_target)
    current_collections = {t.collection for t in targets if t.collection}

    coverage = embedded_models_by_item_id(pid, candidate_ids={sid})
    indexed_models = coverage.get(sid) or []
    indexed_collections = {
        str(m.get("collection"))
        for m in indexed_models
        if m.get("collection")
    }

    for collection_name in indexed_collections - current_collections:
        try:
            locked_delete_document_embeddings(sid, collection_name=collection_name)
            logger.info(
                "Purged stale crawl embeddings for source %s in collection %s",
                sid,
                collection_name,
            )
        except Exception as exc:
            logger.warning(
                "Failed to purge stale crawl embeddings for source %s in %s: %s",
                sid,
                collection_name,
                exc,
            )
