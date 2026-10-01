"""Shared helpers for creating and ingesting ``UploadedDocument`` rows."""
from __future__ import annotations

import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.models import Project, UploadedDocument, User
from app.services.db_vector_consistency import compensate_uploaded_document_on_db_failure
from app.services.notification_service import create_notification
from app.settings import settings

logger = logging.getLogger(__name__)

_MAX_QUEUED_INGEST_JOBS = 200
_FAILED_INGEST_STATUSES = frozenset({"Indexing Failed", "No Text Extracted", "Indexing Timed Out"})
BUSY_INGEST_STATUSES = frozenset({"Queued", "Extracting", "Indexing"})


@dataclass
class IngestOutcome:
    doc_status: str
    chunks_count: int
    message: str
    keep_staging_file: bool


def resolve_upload_project_id(
    db: Session, current_user: User, project_id: Optional[uuid.UUID]
) -> uuid.UUID:
    """Use the given owned project, else the active one (activating the first if none is active)."""
    if project_id:
        project = db.query(Project).filter(
            and_(Project.id == project_id, Project.owner_id == current_user.id)
        ).first()
        if not project:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
        return project.id

    active_project = db.query(Project).filter(
        and_(Project.owner_id == current_user.id, Project.is_active == True)  # noqa: E712
    ).first()
    if active_project:
        return active_project.id

    any_project = db.query(Project).filter(Project.owner_id == current_user.id).first()
    if not any_project:
        # Strict single-project mode: never auto-create fallback projects.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No project found. Please create a project first.",
        )
    any_project.is_active = True
    db.commit()
    db.refresh(any_project)
    return any_project.id


def prepare_ingest_dirs() -> bool:
    """Create temp/staging dirs; returns True when ingest runs through durable jobs."""
    from app.services.document_ingest_orchestration import use_async_document_ingest

    async_ingest = use_async_document_ingest()
    os.makedirs("data/tmp", exist_ok=True)
    if async_ingest:
        os.makedirs(settings.document_staging_dir or "data/staging", exist_ok=True)
    return async_ingest


def ingest_save_path(async_ingest: bool, document_id: str, entry_name: str) -> str:
    from app.services.document_ingest_orchestration import staging_path_for_document

    if async_ingest:
        return staging_path_for_document(document_id, entry_name)
    return f"data/tmp/{document_id}_{entry_name}"


def enforce_ingest_queue_caps(
    db: Session, current_user: User, project_id: Optional[uuid.UUID], *, async_ingest: bool
) -> None:
    """Queue depth caps: prevent runaway queuing without rejecting legitimate bulk imports."""
    if not async_ingest:
        return
    from app.services.job_queue import (
        count_active_ingest_for_project,
        count_pending_jobs_for_user,
        get_org_cap,
    )

    active_jobs = count_pending_jobs_for_user(db, current_user.id)
    if active_jobs >= _MAX_QUEUED_INGEST_JOBS:
        raise HTTPException(
            status_code=429,
            detail=(
                f"Upload queue full ({active_jobs} jobs pending/running). "
                "Wait for existing jobs to finish before uploading more."
            ),
        )
    proj_cap = get_org_cap(
        db,
        current_user.id,
        "max_queued_ingest_per_project",
        int(settings.max_queued_ingest_per_project or 0),
    )
    if proj_cap > 0 and project_id is not None:
        proj_active = count_active_ingest_for_project(db, project_id)
        if proj_active >= proj_cap:
            raise HTTPException(
                status_code=429,
                detail=(
                    f"Project upload queue full ({proj_active} jobs pending/running for this project). "
                    "Wait for existing jobs to finish before uploading more."
                ),
            )


def _notify_inline_result(db: Session, user_id: int, title: str, doc_status: str, chunks: int) -> None:
    try:
        if doc_status == "Indexed" and chunks > 0:
            create_notification(
                db=db,
                user_id=user_id,
                title="Document Uploaded",
                message=(
                    f"Document '{title}' has been uploaded and "
                    f"indexed successfully with {chunks} chunks."
                ),
                type="success",
                action_url="/documents",
            )
        elif doc_status in _FAILED_INGEST_STATUSES:
            create_notification(
                db=db,
                user_id=user_id,
                title="Document Upload Failed",
                message=(
                    f"Document '{title}' was uploaded but indexing "
                    f"failed. Status: {doc_status}"
                ),
                type="error",
                action_url="/documents",
            )
    except Exception as notif_error:
        logger.warning("Failed to create document upload notification: %s", notif_error)


async def run_document_ingest(
    db: Session,
    *,
    document,
    save_path: str,
    user_id: int,
    project_id: uuid.UUID,
    title: str,
    async_ingest: bool,
) -> IngestOutcome:
    """Queue (durable jobs) or run inline ingest for a committed document row."""
    from datetime import datetime

    from app.services.document_ingest_orchestration import (
        ingest_document_inline,
        queue_document_ingest,
    )

    if async_ingest:
        result = queue_document_ingest(
            db,
            document_id=document.id,
            staging_path=save_path,
            user_id=user_id,
            project_id=project_id,
            title=title,
        )
        return IngestOutcome(result.doc_status, result.chunks_count, result.message, True)

    doc_status, chunks_count = await ingest_document_inline(
        db,
        save_path=save_path,
        document_id=str(document.id),
        user_id=user_id,
        project_id=project_id,
    )
    if chunks_count == 0 and doc_status == "Indexed":
        doc_status = "No Text Extracted"
    elif chunks_count > 0:
        logger.info("Ingestion successful: %s chunks created for %s", chunks_count, title)

    document.status = doc_status
    document.chunks = chunks_count
    if doc_status == "Indexed" and chunks_count > 0:
        document.indexed_at = datetime.utcnow()
    try:
        db.commit()
    except Exception:
        db.rollback()
        compensate_uploaded_document_on_db_failure(str(document.id))
        raise
    db.refresh(document)
    _notify_inline_result(db, user_id, title, doc_status, chunks_count)
    return IngestOutcome(
        doc_status, chunks_count, f"Document uploaded and status: {doc_status}", False
    )


def _stored_training_file(db: Session, document: UploadedDocument) -> tuple[bytes, str]:
    """Stored bytes plus a staging file name whose extension the extractor understands."""
    from app.services.reindex_service import (
        _uploaded_document_bytes,
        reindex_temp_suffix_for_uploaded_doc,
    )

    content = _uploaded_document_bytes(document, db)
    if not content.strip():
        raise HTTPException(status_code=400, detail="This source has no content to train.")
    try:
        suffix = reindex_temp_suffix_for_uploaded_doc(document, content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="This file type can't be retrained.") from exc
    title = (document.title or "").strip()
    stem = title[: -len(suffix)] if title.lower().endswith(suffix) else title
    slug = re.sub(r"[^\w\-]+", "_", stem)[:60].strip("_") or "source"
    return content, f"{slug}{suffix}"


async def retrain_stored_document(
    db: Session, current_user: User, document: UploadedDocument
) -> IngestOutcome:
    """Train again from the bytes saved on ``document`` (honors its pinned AI model)."""
    content, staging_name = _stored_training_file(db, document)
    async_ingest = prepare_ingest_dirs()
    enforce_ingest_queue_caps(db, current_user, document.project_id, async_ingest=async_ingest)
    document.status = "Queued"
    db.commit()
    db.refresh(document)

    save_path = ingest_save_path(async_ingest, str(document.id), staging_name)
    with open(save_path, "wb") as fh:
        fh.write(content)
    keep_staging = False
    try:
        outcome = await run_document_ingest(
            db,
            document=document,
            save_path=save_path,
            user_id=current_user.id,
            project_id=document.project_id,
            title=document.title,
            async_ingest=async_ingest,
        )
        keep_staging = outcome.keep_staging_file
        return outcome
    except Exception:
        db.rollback()
        if document.status in BUSY_INGEST_STATUSES:
            document.status = "Indexing Failed"
            db.commit()
        raise
    finally:
        if not keep_staging and os.path.exists(save_path):
            os.remove(save_path)
