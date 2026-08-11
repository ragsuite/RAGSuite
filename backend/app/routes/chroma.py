"""Chroma vector index health and repair endpoints."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user_required
from ..db import get_db
from ..models import UploadedDocument, User
from ..services.audit_service import emit_audit
from ..services.chroma_repair import check_chroma_health, repair_chroma_index
from ..services.rag.embedding_resolver import resolve_ingest_for_project
from ..services.rag.embedder_factory import collection_name_for
from ..services.reindex_service import (
    count_reindex_items,
    enqueue_durable_reindex,
    finalize_reindex_job,
    start_reindex_job,
)
from ..services.job_settings_check import use_durable_reindex

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Chroma"])


class ChromaCollectionHealth(BaseModel):
    collection: str
    metadata_chunks: int
    hnsw_chunks: int
    orphan_chunks: int
    hnsw_readable: bool
    api_healthy: bool
    status: str


class ChromaHealthResponse(BaseModel):
    healthy: bool
    local_path: Optional[str] = None
    collections: List[ChromaCollectionHealth] = Field(default_factory=list)
    message: str = ""


class ChromaRepairResponse(BaseModel):
    orphans_removed: int
    collections_repaired: int
    backup_path: Optional[str] = None
    healthy_after: bool
    message: str


class ProjectChromaHealthResponse(BaseModel):
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


@router.get("/chroma/health", response_model=ChromaHealthResponse)
def get_chroma_health(
    current_user: User = Depends(get_current_user_required),
) -> ChromaHealthResponse:
    report = check_chroma_health()
    return ChromaHealthResponse(
        healthy=report["healthy"],
        local_path=report.get("local_path"),
        collections=[ChromaCollectionHealth(**row) for row in report.get("collections", [])],
        message=report.get("message", ""),
    )


@router.post("/chroma/repair", response_model=ChromaRepairResponse)
def repair_chroma(
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> ChromaRepairResponse:
    before = check_chroma_health()
    if before.get("local_path") is None:
        raise HTTPException(
            status_code=400,
            detail="No local Chroma data directory found for repair.",
        )

    result = repair_chroma_index(create_backup=True)
    after = check_chroma_health()

    emit_audit(
        event_type="chroma.repair",
        user_id=current_user.id,
        resource_type="chroma",
        resource_id="local",
        summary="Chroma index repair",
        details={
            "orphans_removed": result.get("orphans_removed", 0),
            "collections_repaired": result.get("collections_repaired", 0),
            "backup_path": result.get("backup_path"),
            "healthy_after": after.get("healthy", False),
        },
        db=db,
    )

    return ChromaRepairResponse(
        orphans_removed=int(result.get("orphans_removed", 0)),
        collections_repaired=int(result.get("collections_repaired", 0)),
        backup_path=result.get("backup_path"),
        healthy_after=bool(after.get("healthy", False)),
        message=result.get("message", "Repair finished."),
    )


@router.get("/projects/{project_id}/chroma-health", response_model=ProjectChromaHealthResponse)
def get_project_chroma_health(
    project_id: str,
    current_user: User = Depends(get_current_user_required),
    db: Session = Depends(get_db),
) -> ProjectChromaHealthResponse:
    from ..routes.embeddings import _project_owned_by_user, _parse_project_id

    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user.id)

    provider, model, _ = resolve_ingest_for_project(db, project_uuid)
    collection = collection_name_for(str(project_uuid), provider, model)
    uses_shared = collection == "rag_collection"

    report = check_chroma_health(collection_names=[collection])
    row: Dict[str, Any] = {}
    for item in report.get("collections", []):
        if item.get("collection") == collection:
            row = item
            break

    if not row:
        return ProjectChromaHealthResponse(
            project_id=project_id,
            collection=collection,
            healthy=True,
            status="empty",
            orphan_chunks=0,
            uses_shared_legacy_collection=uses_shared,
            message="No Chroma data found for this collection yet.",
        )

    healthy = bool(row.get("api_healthy") and row.get("orphan_chunks", 0) == 0)
    status = row.get("status", "unknown")
    orphans = int(row.get("orphan_chunks", 0))

    if not healthy and orphans > 0:
        message = (
            f"Search index needs repair ({orphans} mismatched chunks). "
            "Use Repair search index — your documents in the database are safe."
        )
    elif not healthy:
        message = "Search index is unhealthy. Try repair, then re-index if needed."
    elif uses_shared:
        message = (
            "Healthy. This project shares the legacy search index with other projects "
            "using the default embedding model."
        )
    else:
        message = "Search index looks healthy."

    return ProjectChromaHealthResponse(
        project_id=project_id,
        collection=collection,
        healthy=healthy,
        status=status,
        orphan_chunks=orphans,
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
    """Safe recovery: backup + repair Chroma metadata, then queue a project re-index."""
    from ..routes.embeddings import _project_owned_by_user, _parse_project_id

    project_uuid = _parse_project_id(project_id)
    _project_owned_by_user(db, project_uuid, current_user.id)

    repair_result = repair_chroma_index(create_backup=True)
    source = "chat" if body.source == "chat" else "search"
    provider, model, _ = resolve_ingest_for_project(db, project_uuid)
    target_collection = collection_name_for(str(project_uuid), provider, model)

    reindex_total = count_reindex_items(
        db, project_uuid, include_crawled=body.include_crawled
    )
    start_reindex_job(
        db,
        project_uuid,
        current_user.id,
        source,
        reindex_total,
        target_collection,
    )

    job_count = 0
    run_id: Optional[str] = None
    if use_durable_reindex():
        all_doc_ids = [
            str(d.id)
            for d in db.query(UploadedDocument)
            .filter(UploadedDocument.project_id == project_uuid)
            .all()
            if (d.text_content or b"").strip()
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
        "message": (
            "Backup created, index repair attempted, and re-index queued. "
            "Your original documents are unchanged."
        ),
    }
