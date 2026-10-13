"""Per-source "Use in answers" switch.

Mounted under ``/api/v1/crawl`` so the ``crawl:manage`` project permission applies. Switching
never touches pages, vectors or running jobs; it only changes what queries may retrieve.
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..auth import get_current_user_required
from ..db import get_db
from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType, CrawlJob, CrawlSource, User
from ..services.audit_service import emit_audit
from ..services.rag import kb_generation, source_availability, source_routing
from .crawl import _IN_FLIGHT_JOB_STATUSES, _can_manage_project

router = APIRouter(prefix="/api/v1/crawl", tags=["Crawl"])


class SourceAnswersRequest(BaseModel):
    enabled: bool


class SourceAnswersOut(BaseModel):
    source_id: UUID
    use_in_answers: bool


def _has_running_work(db: Session, source_id: UUID) -> bool:
    crawl = (
        db.query(CrawlJob.id)
        .filter(CrawlJob.source_id == source_id, CrawlJob.status.in_(list(_IN_FLIGHT_JOB_STATUSES)))
        .first()
    )
    if crawl is not None:
        return True
    ingest = (
        db.query(BackgroundJob.id)
        .filter(
            BackgroundJob.job_type == BackgroundJobType.CRAWL_INGEST_BATCH.value,
            BackgroundJob.status.in_([BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]),
            BackgroundJob.payload["source_id"].as_string() == str(source_id),
        )
        .first()
    )
    return ingest is not None


def _has_indexed_content(source: CrawlSource) -> bool:
    return source.trained_at is not None or (source.documents_count or 0) > 0


@router.put("/sites/{source_id}/answers", response_model=SourceAnswersOut)
def set_source_use_in_answers(
    source_id: UUID,
    body: SourceAnswersRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
    if not source or not _can_manage_project(db, current_user, source.project_id):
        raise HTTPException(status_code=404, detail="Source not found")
    if source.use_in_answers is not False and body.enabled:
        return SourceAnswersOut(source_id=source.id, use_in_answers=True)
    if source.use_in_answers is False and not body.enabled:
        return SourceAnswersOut(source_id=source.id, use_in_answers=False)
    if _has_running_work(db, source.id):
        raise HTTPException(status_code=409, detail="Wait until training finishes or stop it first.")
    if not _has_indexed_content(source):
        raise HTTPException(status_code=409, detail="This source has no trained content yet.")

    source.use_in_answers = body.enabled
    source.updated_at = datetime.now(timezone.utc)
    db.commit()

    kb_generation.bump()
    source_availability.invalidate(str(source.project_id))
    source_routing.invalidate(str(source.project_id))
    emit_audit(
        event_type="crawl.source.answers_enabled" if body.enabled else "crawl.source.answers_disabled",
        request=request,
        user_id=current_user.id,
        project_id=source.project_id,
        resource_type="crawl_source",
        resource_id=str(source.id),
        summary=f"Source {'included in' if body.enabled else 'excluded from'} answers: {source.name}",
    )
    return SourceAnswersOut(source_id=source.id, use_in_answers=body.enabled)
