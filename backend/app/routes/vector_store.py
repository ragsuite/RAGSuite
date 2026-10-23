"""Vector index health and repair endpoints (pgvector).

Paths keep their historical ``chroma`` names so existing clients keep working.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user_required
from ..db import get_db
from ..models import UploadedDocument, User
from ..services.audit_service import emit_audit
from ..services.rag.embedding_resolver import resolve_ingest_for_project
from ..services.rag.embedder_factory import collection_name_for
from ..services.rag.vector_store.health import repair_vector_indexes, vector_store_status
from ..services.reindex_service import (
    count_reindex_items,
    enqueue_durable_reindex,
    finalize_reindex_job,
    start_reindex_job,
)
from ..services.job_settings_check import use_durable_reindex
from ..services.textual_sources import is_untrained_textual_draft

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Vector store"])


class VectorCollectionHealth(BaseModel):
    collection: str
    metadata_chunks: int
    hnsw_chunks: int
    orphan_chunks: int
    hnsw_readable: bool
    api_healthy: bool
    status: str


class VectorHealthResponse(BaseModel):
    healthy: bool
    local_path: Optional[str] = None
    pgvector_version: Optional[str] = None
    elasticsearch_version: Optional[str] = None
    collections: List[VectorCollectionHealth] = Field(default_factory=list)
    message: str = ""


class VectorRepairResponse(BaseModel):
    orphans_removed: int
    collections_repaired: int
    backup_path: Optional[str] = None
    healthy_after: bool
    message: str


class ProjectVectorHealthResponse(BaseModel):
    project_id: str
    collection: str
    healthy: bool
    status: str
    orphan_chunks: int
    uses_shared_legacy_collection: bool
    message: str


class ProjectReindexRequest(BaseModel):
    source: str = Field(default="search", pattern="^(search|chat)$")
    include_crawled: bool = True


def _collection_health(row: Dict[str, Any]) -> VectorCollectionHealth:
    count = int(row.get("count") or 0)
    valid = bool(row.get("index_valid"))
    return VectorCollectionHealth(
        collection=row["collection"],
        metadata_chunks=count,
        hnsw_chunks=count if valid else 0,
        orphan_chunks=0,
        hnsw_readable=valid or row.get("status") == "empty",
        api_healthy=row.get("status") != "index_missing",
        status=row.get("status", "unknown"),
    )


@router.get("/chroma/health", response_model=VectorHealthResponse)
def get_vector_health(
    current_user: User = Depends(get_current_user_required),
) -> VectorHealthResponse:
    report = vector_store_status()
    return VectorHealthResponse(
        healthy=report["healthy"],
        pgvector_version=report.get("pgvector_version"),
        elasticsearch_version=report.get("elasticsearch_version"),
        collections=[_collection_health(row) for row in report.get("collections", [])],
        message=report.get("message", ""),
    )


@router.post("/chroma/repair", response_model=VectorRepairResponse)
def repair_vector_store(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> VectorRepairResponse:
    result = repair_vector_indexes()
    after = vector_store_status(include_counts=False)
    emit_audit(
        event_type="vector_store.repair",
        user_id=current_user.id,
        resource_type="vector_store",
        resource_id="pgvector",
        summary="Vector index repair",
        details={
            "collections_repaired": result["collections_repaired"],
            "repaired": result["repaired"],
            "healthy_after": after.get("healthy", False),
        },
        db=db,
    )
    return VectorRepairResponse(
        orphans_removed=0,
        collections_repaired=int(result["collections_repaired"]),
        healthy_after=bool(after.get("healthy", False)),
        message=result["message"],
    )


@router.get("/projects/{project_id}/chroma-health", response_model=ProjectVectorHealthResponse)
def get_project_vector_health(
    project_id: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> ProjectVectorHealthResponse:
    from ..routes.embeddings import _project_owned_by_user, _parse_project_id

    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user)

    provider, model, _ = resolve_ingest_for_project(db, project_uuid)
    collection = collection_name_for(str(project_uuid), provider, model)
    uses_shared = collection == "rag_collection"

    report = vector_store_status([collection], include_counts=False)
    row = next((r for r in report.get("collections", []) if r["collection"] == collection), None)
    if row is None or row["status"] == "empty":
        return ProjectVectorHealthResponse(
            project_id=project_id,
            collection=collection,
            healthy=bool(report.get("pgvector_version")),
            status="empty",
            orphan_chunks=0,
            uses_shared_legacy_collection=uses_shared,
            message="No vectors stored for this collection yet.",
        )

    healthy = row["status"] == "ok"
    if not healthy:
        message = (
            "Vector index is missing or invalid (semantic search is slower). "
            "Use Repair search index to rebuild it."
        )
    elif uses_shared:
        message = (
            "Healthy. This project shares the legacy search index with other projects "
            "using the default embedding model."
        )
    else:
        message = "Search index looks healthy."
    return ProjectVectorHealthResponse(
        project_id=project_id,
        collection=collection,
        healthy=healthy,
        status=row["status"],
        orphan_chunks=0,
        uses_shared_legacy_collection=uses_shared,
        message=message,
    )


@router.post("/projects/{project_id}/repair-index", response_model=Dict[str, Any])
def repair_project_index(
    project_id: str,
    body: ProjectReindexRequest,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Rebuild the project's vector index if needed, then queue a project re-index."""
    from ..routes.embeddings import _project_owned_by_user, _parse_project_id

    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user)

    source = "chat" if body.source == "chat" else "search"
    provider, model, _ = resolve_ingest_for_project(db, project_uuid)
    target_collection = collection_name_for(str(project_uuid), provider, model)
    repair_result = repair_vector_indexes([target_collection])

    reindex_total = count_reindex_items(
        db, project_uuid, include_crawled=body.include_crawled, source=source
    )
    start_reindex_job(db, project_uuid, current_user.id, source, reindex_total, target_collection)

    job_count = 0
    run_id: Optional[str] = None
    if use_durable_reindex():
        all_doc_ids = [
            str(d.id)
            for d in db.query(UploadedDocument)
            .filter(UploadedDocument.project_id == project_uuid)
            .all()
            if (d.text_content or b"").strip()
            and not is_untrained_textual_draft(d.status, d.chunks)
        ]
        run_id, job_count = enqueue_durable_reindex(
            db,
            project_id=project_uuid,
            source=source,
            user_id=current_user.id,
            document_ids=all_doc_ids,
            include_crawled=body.include_crawled,
        )
        if job_count == 0:
            finalize_reindex_job(db, project_uuid, source, status="done")

    emit_audit(
        event_type="project.repair_index",
        user_id=current_user.id,
        project_id=project_uuid,
        resource_type="project",
        resource_id=str(project_uuid),
        summary="Project search index repair + re-index",
        details={
            "source": source,
            "include_crawled": body.include_crawled,
            "repair": repair_result,
            "reindex_run_id": run_id,
            "reindex_job_count": job_count,
        },
        db=db,
    )

    return {
        "status": "started",
        "repair": repair_result,
        "reindex_run_id": run_id,
        "reindex_job_count": job_count,
        "message": "Index repair attempted and re-index queued. Your original documents are unchanged.",
    }
