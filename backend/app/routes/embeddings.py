"""Embedding status and reindex endpoints.

Exposes:
- GET  /api/v1/projects/{project_id}/embedding-status?source=search|chat
- GET  /api/v1/projects/{project_id}/embedding-item-coverage?source=search|chat
- POST /api/v1/projects/{project_id}/reindex?source=search|chat&include_crawled=true|false
  Optional JSON body: ``{"document_ids": ["<uuid>", ...]}`` to re-embed **only** those
  uploaded documents (must belong to the project). When set, crawled URLs are never
  included and ``include_crawled`` is ignored.
"""

from __future__ import annotations

import logging
import re
import threading
import uuid
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..auth import get_current_user_required
from ..db import get_db, SessionLocal
from ..models import (
    Project,
    UploadedDocument,
    User,
)
from ..services.rag.embedder_factory import (
    EMBEDDING_REGISTRY,
    JINA_FALLBACK_MODEL,
    JINA_FALLBACK_PROVIDER,
    collection_name_for,
    get_embedding_meta,
)
from ..services.rag.embedding_resolver import (
    describe_saved_embedding_settings,
    resolve_for_project,
    saved_embedding_fallback_used,
)
from ..services.rag.singleton import get_pipeline
from ..services.audit_service import emit_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["Embedding Selection"])

Source = Literal["search", "chat"]


# ---- Reindex job tracking (Postgres — survives restarts) --------------------

from ..services.reindex_service import (
    assess_embedding_coverage,
    chroma_index_readiness,
    count_reindex_items,
    enqueue_durable_reindex,
    finalize_reindex_job,
    get_item_embedding_coverage,
    invalidate_item_embedding_coverage_cache,
    read_reindex_job,
    run_reindex_inline,
    start_reindex_job,
)

# Short-lived status cache so Model Settings banners stay responsive.
_STATUS_CACHE: Dict[tuple, tuple] = {}
_STATUS_CACHE_TTL_SEC = 30.0


def _status_cache_get(project_id: str, source: str) -> Optional[Any]:
    import time

    key = (str(project_id), source)
    hit = _STATUS_CACHE.get(key)
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > _STATUS_CACHE_TTL_SEC:
        _STATUS_CACHE.pop(key, None)
        return None
    return payload


def _status_cache_set(project_id: str, source: str, payload: Any) -> None:
    import time

    _STATUS_CACHE[(str(project_id), source)] = (time.time(), payload)


def invalidate_embedding_status_cache(project_id: Optional[str] = None) -> None:
    if project_id is None:
        _STATUS_CACHE.clear()
        return
    pid = str(project_id)
    for key in list(_STATUS_CACHE):
        if key[0] == pid:
            del _STATUS_CACHE[key]


# ---- Helpers ----------------------------------------------------------------


def _project_owned_by_user(db: Session, project_id: uuid.UUID, user_id: int) -> Project:
    project = (
        db.query(Project)
        .filter(and_(Project.id == project_id, Project.owner_id == user_id))
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _parse_project_id(project_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(project_id)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid project_id")


def _count_uploaded_docs(db: Session, project_uuid: uuid.UUID) -> int:
    return (
        db.query(UploadedDocument)
        .filter(UploadedDocument.project_id == project_uuid)
        .count()
    )


def _count_chunks_in_collection(project_id: str, collection_name: str) -> int:
    p = get_pipeline()
    if p is None:
        return 0
    return p.vdb.count_filtered_exact(project_id=project_id, collection_name=collection_name)


def _list_other_collections_with_data(
    project_id: str,
    active_collection: str,
) -> List[Dict[str, Any]]:
    """Inspect every known Chroma collection and report any non-active one that
    still holds vectors for this project. Used to flag "old vectors in another
    model" in the UI."""
    p = get_pipeline()
    if p is None:
        return []

    other: List[Dict[str, Any]] = []
    for name in p.vdb.list_known_collections():
        if name == active_collection:
            continue
        try:
            count = p.vdb.count_filtered_exact(project_id=project_id, collection_name=name)
        except Exception:
            count = 0
        if count > 0:
            provider, model = _name_to_provider_model(name)
            other.append({
                "collection": name,
                "provider": provider,
                "model": model,
                "count": count,
            })
    return other


_LEGACY_COLLECTION = "rag_collection"


def _name_to_provider_model(collection_name: str) -> tuple[Optional[str], Optional[str]]:
    """Best-effort reverse parse of our naming convention."""
    if collection_name == _LEGACY_COLLECTION:
        return JINA_FALLBACK_PROVIDER, JINA_FALLBACK_MODEL
    # Convention: proj_<id>__<provider>__<model>
    m = re.match(r"^proj_[^_]+(?:_[^_]+)*?__([a-z0-9_]+)__(.+)$", collection_name)
    if not m:
        return None, None
    return m.group(1), m.group(2)


# ---- Schemas ----------------------------------------------------------------


class EmbeddingStatusOut(BaseModel):
    project_id: str
    source: Source
    active_provider: str
    active_model: str
    active_collection: str
    active_vectors: int
    total_documents: int
    needs_reindex: bool
    """Uploaded docs + crawl sources that should have vectors in the active collection."""
    coverage_items_total: int = 0
    coverage_items_embedded: int = 0
    coverage_items_missing: int = 0
    missing_uploaded_count: int = 0
    missing_crawl_sources_count: int = 0
    other_collections: List[Dict[str, Any]]
    model_meta: Dict[str, Any]
    fallback_used: bool
    # Saved settings (dropdown) vs resolved active_* (runtime). Never includes raw API keys.
    saved_provider: str = ""
    saved_model: str = ""
    api_key_configured: bool = False
    index_available: bool = True
    index_error: Optional[str] = None


class ReindexInBody(BaseModel):
    """Optional body for POST /reindex."""

    document_ids: Optional[List[uuid.UUID]] = None


class ReindexResponse(BaseModel):
    project_id: str
    source: Source
    status: str
    total: int
    embedded: int
    skipped: int
    failed: int
    error: Optional[str] = None
    collection: str


class ItemEmbeddedModelOut(BaseModel):
    provider: Optional[str] = None
    model: Optional[str] = None
    collection: str
    is_active: bool


class ItemEmbeddingCoverageEntryOut(BaseModel):
    id: str
    embedded_models: List[ItemEmbeddedModelOut]
    missing_active: bool


class EmbeddingItemCoverageOut(BaseModel):
    project_id: str
    source: Source
    active_provider: str
    active_model: str
    active_collection: str
    documents: List[ItemEmbeddingCoverageEntryOut]
    crawl_sources: List[ItemEmbeddingCoverageEntryOut]


# ---- GET /embedding-status --------------------------------------------------


@router.get("/{project_id}/embedding-status", response_model=EmbeddingStatusOut)
def get_embedding_status(
    project_id: str,
    source: Source = Query("search"),
    include_other: bool = Query(
        False,
        description="When true, scan every known Chroma collection for leftover vectors (slow).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> EmbeddingStatusOut:
    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user.id)

    cached = _status_cache_get(str(project_uuid), source)
    if cached is not None and not include_other:
        return cached

    provider, model, _ = resolve_for_project(
        db, project_uuid, source=source, honor_requested_source=True
    )
    active_collection = collection_name_for(project_uuid, provider, model)
    meta = get_embedding_meta(provider, model)
    saved_provider, saved_model, api_key_configured = describe_saved_embedding_settings(
        db, project_uuid, source
    )

    index_available, index_error = chroma_index_readiness()
    if not index_available:
        fallback_used = saved_embedding_fallback_used(
            db, project_uuid, source, provider, model
        )
        return EmbeddingStatusOut(
            project_id=str(project_uuid),
            source=source,
            active_provider=provider,
            active_model=model,
            active_collection=active_collection,
            active_vectors=0,
            total_documents=0,
            needs_reindex=False,
            coverage_items_total=0,
            coverage_items_embedded=0,
            coverage_items_missing=0,
            missing_uploaded_count=0,
            missing_crawl_sources_count=0,
            other_collections=[],
            model_meta={
                "dim": meta.dim,
                "max_tokens": meta.max_tokens,
                "batch": meta.batch,
                "metric": meta.metric,
                "normalize": meta.normalize,
                "needs_api_key": meta.needs_api_key,
                "known": EMBEDDING_REGISTRY.get((provider, model)) is not None,
            },
            fallback_used=fallback_used,
            saved_provider=saved_provider,
            saved_model=saved_model,
            api_key_configured=api_key_configured,
            index_available=False,
            index_error=index_error,
        )

    active_vectors = _count_chunks_in_collection(str(project_uuid), active_collection)
    coverage = assess_embedding_coverage(
        db, project_uuid, active_collection, source=source
    )
    # Default path skips multi-collection scans — they dominated status latency and
    # the Model Settings banner does not render other_collections today.
    other_collections = (
        _list_other_collections_with_data(str(project_uuid), active_collection)
        if include_other
        else []
    )

    fallback_used = saved_embedding_fallback_used(
        db, project_uuid, source, provider, model
    )

    payload = EmbeddingStatusOut(
        project_id=str(project_uuid),
        source=source,
        active_provider=provider,
        active_model=model,
        active_collection=active_collection,
        active_vectors=int(active_vectors),
        total_documents=int(coverage.total_documents),
        needs_reindex=coverage.needs_reindex,
        coverage_items_total=coverage.coverage_items_total,
        coverage_items_embedded=coverage.coverage_items_embedded,
        coverage_items_missing=coverage.coverage_items_missing,
        missing_uploaded_count=coverage.missing_uploaded_count,
        missing_crawl_sources_count=coverage.missing_crawl_sources_count,
        other_collections=other_collections,
        model_meta={
            "dim": meta.dim,
            "max_tokens": meta.max_tokens,
            "batch": meta.batch,
            "metric": meta.metric,
            "normalize": meta.normalize,
            "needs_api_key": meta.needs_api_key,
            "known": EMBEDDING_REGISTRY.get((provider, model)) is not None,
        },
        fallback_used=fallback_used,
        saved_provider=saved_provider,
        saved_model=saved_model,
        api_key_configured=api_key_configured,
        index_available=True,
        index_error=None,
    )
    _status_cache_set(str(project_uuid), source, payload)
    return payload


@router.get("/{project_id}/embedding-item-coverage", response_model=EmbeddingItemCoverageOut)
def get_embedding_item_coverage(
    project_id: str,
    source: Source = Query(
        "chat",
        description="Active embedding model source used to evaluate missing_active flags.",
    ),
    skip_cache: bool = Query(
        False,
        description="When true, bypass the short-lived server cache (use after reindex completes).",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> EmbeddingItemCoverageOut:
    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user.id)
    payload = get_item_embedding_coverage(
        db, project_uuid, source=source, skip_cache=skip_cache
    )
    return EmbeddingItemCoverageOut(**payload)


# ---- POST /reindex ----------------------------------------------------------


def _run_reindex_thread(
    project_uuid: uuid.UUID,
    source: str,
    provider: str,
    model: str,
    api_key: Optional[str],
    target_collection: str,
    include_crawled: bool = True,
    document_ids: Optional[List[uuid.UUID]] = None,
) -> None:
    """Background thread wrapper — creates its own DB session."""
    db = SessionLocal()
    try:
        run_reindex_inline(
            db,
            project_uuid,
            source,
            provider,
            model,
            api_key,
            target_collection,
            include_crawled=include_crawled,
            document_ids=document_ids,
        )
    except Exception as exc:
        logger.error("Reindex background thread failed for %s: %s", project_uuid, exc)
        from datetime import datetime, timezone

        row = read_reindex_job(db, project_uuid, source)
        if row:
            row.status = "error"
            row.error = str(exc)
            row.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


@router.post("/{project_id}/reindex", response_model=ReindexResponse)
def reindex_project_embeddings(
    project_id: str,
    request: Request,
    source: Source = Query("search"),
    include_crawled: bool = Query(
        True,
        description="When false, only uploaded documents are re-embedded; crawled URL pages are skipped.",
    ),
    body: ReindexInBody = Body(default_factory=ReindexInBody),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> ReindexResponse:
    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user.id)

    from ..services.rag.embedding_resolver import resolve_reindex_for_project

    provider, model, api_key = resolve_reindex_for_project(db, project_uuid, source=source)
    target_collection = collection_name_for(project_uuid, provider, model)

    from ..services.concurrency_limits import assert_can_start_reindex

    try:
        assert_can_start_reindex(db, project_uuid)
    except ValueError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc

    existing = read_reindex_job(db, project_uuid, source)
    if existing and existing.status == "running":
        from ..services.reindex_service import clear_orphaned_reindex_job_if_idle

        clear_orphaned_reindex_job_if_idle(db, project_uuid, source)
        existing = read_reindex_job(db, project_uuid, source)
    if existing and existing.status == "running":
        return ReindexResponse(
            project_id=str(project_uuid),
            source=source,
            status="running",
            total=int(existing.total or 0),
            embedded=int(existing.embedded or 0),
            skipped=int(existing.skipped or 0),
            failed=int(existing.failed or 0),
            error=existing.error,
            collection=target_collection,
        )

    scoped_ids: Optional[List[uuid.UUID]] = None
    if body.document_ids:
        raw = list(dict.fromkeys(body.document_ids))
        if len(raw) > 500:
            raise HTTPException(status_code=400, detail="Too many document_ids (max 500).")
        if not raw:
            raise HTTPException(status_code=400, detail="document_ids cannot be empty.")
        uploaded_count = (
            db.query(UploadedDocument)
            .filter(
                UploadedDocument.project_id == project_uuid,
                UploadedDocument.id.in_(raw),
            )
            .count()
        )
        if uploaded_count == 0:
            raise HTTPException(
                status_code=400,
                detail="No uploaded documents matched the given ids for this project.",
            )
        scoped_ids = raw
        include_for_thread = False
        reindex_total = count_reindex_items(
            db, project_uuid, include_crawled=False, document_ids=scoped_ids
        )
    else:
        include_for_thread = include_crawled
        reindex_total = count_reindex_items(
            db, project_uuid, include_crawled=include_for_thread
        )

    start_reindex_job(
        db,
        project_uuid,
        current_user.id,
        source,
        reindex_total,
        target_collection,
    )

    invalidate_item_embedding_coverage_cache(str(project_uuid))
    invalidate_embedding_status_cache(str(project_uuid))

    from ..services.job_settings_check import use_durable_reindex
    from ..services.reindex_service import _document_has_reindexable_bytes

    if use_durable_reindex():
        if scoped_ids:
            uploaded_rows = (
                db.query(UploadedDocument)
                .filter(
                    UploadedDocument.project_id == project_uuid,
                    UploadedDocument.id.in_(scoped_ids),
                )
                .all()
            )
            all_doc_ids = []
            for d in uploaded_rows:
                if not _document_has_reindexable_bytes(d, db):
                    continue
                all_doc_ids.append(str(d.id))
                # Surface transitional UI while selected-document reindex runs.
                if d.status in ("Queued", "Indexing Failed", "No Text Extracted", "Failed"):
                    d.status = "Indexing"
            db.commit()
            if scoped_ids and not all_doc_ids:
                finalize_reindex_job(
                    db,
                    project_uuid,
                    source,
                    status="error",
                    error="Selected documents have no recoverable file content to re-index.",
                )
                raise HTTPException(
                    status_code=400,
                    detail="Selected documents have no recoverable file content to re-index.",
                )
        else:
            all_doc_ids = [
                str(d.id)
                for d in db.query(UploadedDocument)
                .filter(UploadedDocument.project_id == project_uuid)
                .all()
                if _document_has_reindexable_bytes(d, db)
            ]
        _, job_count = enqueue_durable_reindex(
            db,
            project_id=project_uuid,
            source=source,
            user_id=current_user.id,
            document_ids=all_doc_ids,
            include_crawled=include_for_thread,
        )
        if job_count == 0:
            finalize_reindex_job(db, project_uuid, source, status="done")
    else:
        t = threading.Thread(
            target=_run_reindex_thread,
            args=(
                project_uuid,
                source,
                provider,
                model,
                api_key,
                target_collection,
                include_for_thread,
                scoped_ids,
            ),
            daemon=True,
        )
        t.start()

    emit_audit(
        event_type="embedding.reindex.requested",
        request=request,
        user_id=current_user.id,
        project_id=project_uuid,
        resource_type="project",
        resource_id=str(project_uuid),
        summary=f"Embedding reindex requested ({source})",
        details={
            "source": source,
            "include_crawled": include_for_thread,
            "document_count": reindex_total,
        },
    )

    return ReindexResponse(
        project_id=str(project_uuid),
        source=source,
        status="started",
        total=reindex_total,
        embedded=0,
        skipped=0,
        failed=0,
        error=None,
        collection=target_collection,
    )


@router.get("/{project_id}/reindex-progress", response_model=ReindexResponse)
def get_reindex_progress(
    project_id: str,
    source: Source = Query("search"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
) -> ReindexResponse:
    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user.id)

    provider, model, _ = resolve_for_project(
        db, project_uuid, source=source, honor_requested_source=True
    )
    target_collection = collection_name_for(project_uuid, provider, model)

    job = read_reindex_job(db, project_uuid, source)
    if not job:
        return ReindexResponse(
            project_id=str(project_uuid),
            source=source,
            status="idle",
            total=0,
            embedded=0,
            skipped=0,
            failed=0,
            error=None,
            collection=target_collection,
        )

    return ReindexResponse(
        project_id=str(project_uuid),
        source=source,
        status=str(job.status or "idle"),
        total=int(job.total or 0),
        embedded=int(job.embedded or 0),
        skipped=int(job.skipped or 0),
        failed=int(job.failed or 0),
        error=job.error,
        collection=target_collection,
    )


__all__ = ["router"]
