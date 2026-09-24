"""Shared background-job actions used by REST and MCP."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models import BackgroundJob, BackgroundJobStatus


def retry_failed_job(db: Session, user, job_id: uuid.UUID) -> BackgroundJob:
    """Reset a FAILED job to PENDING. Only the owner (or a superuser) may retry it."""
    job = db.query(BackgroundJob).filter(BackgroundJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.user_id != getattr(user, "id", None) and not getattr(user, "is_superuser", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to retry this job")
    if job.status != BackgroundJobStatus.FAILED.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Job is {job.status} — only FAILED jobs can be retried",
        )
    job.status = BackgroundJobStatus.PENDING.value
    job.error = None
    job.retry_after = None
    job.finished_at = None
    job.started_at = None
    job.queued_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(job)
    return job
