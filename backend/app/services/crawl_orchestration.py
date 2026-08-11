"""
Unified crawl start path for manual API, scheduler, and onboarding.

All crawl starts must go through start_crawl_for_source so we never
enqueue and inline-run the same job, and scheduled crawls use the same
queue as manual starts.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import CrawlJob, CrawlJobStatus, CrawlSource
from ..settings import settings
from .concurrency_limits import assert_can_start_crawl, notify_crawl_slots_full, source_has_active_crawl
from .crawler import create_crawl_job, run_crawl

logger = logging.getLogger(__name__)


class CrawlStartTrigger(str, Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    ONBOARDING = "onboarding"


@dataclass
class CrawlStartResult:
    job_id: uuid.UUID
    queued_at: object  # datetime
    message: str
    enqueue_status: Optional[str] = None  # e.g. pending_worker
    http_status: int = 200


def start_crawl_for_source(
    db: Session,
    source_id: uuid.UUID,
    *,
    user_id: Optional[int] = None,
    trigger: CrawlStartTrigger = CrawlStartTrigger.MANUAL,
    run_inline_fallback: bool = True,
) -> CrawlStartResult:
    """
    Create a crawl job and queue execution (or inline when durable jobs off).

    Raises HTTPException(409) when a crawl is already active for this source.
    """
    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    if user_id is None:
        user_id = source.created_by_id

    if source_has_active_crawl(db, source_id):
        raise HTTPException(
            status_code=409,
            detail="A crawl is already in progress for this source.",
        )

    # Check if project is at the concurrency limit.
    # If yes → create a WAITING job (queued) rather than returning 429.
    slots_full = False
    try:
        assert_can_start_crawl(db, source.project_id)
    except ValueError:
        slots_full = True

    if slots_full:
        # Create job in WAITING state — will be auto-promoted when a slot frees up.
        try:
            job_id = create_crawl_job(db, source_id, initial_status=CrawlJobStatus.WAITING)
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail="A crawl is already in progress for this source.",
            ) from exc

        job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
        if not job:
            raise HTTPException(status_code=500, detail="Crawl job not found after creation")

        logger.info(
            "Crawl slots full — created WAITING job job_id=%s source_id=%s trigger=%s",
            job_id,
            source_id,
            trigger.value,
        )
        return CrawlStartResult(
            job_id=job.id,
            queued_at=job.queued_at,
            message="All crawl slots are busy — your crawl is queued and will start automatically when a slot opens.",
            enqueue_status="waiting",
            http_status=202,
        )

    try:
        job_id = create_crawl_job(db, source_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        logger.warning(
            "crawl start blocked by active-job constraint source_id=%s trigger=%s",
            source_id,
            trigger.value,
        )
        raise HTTPException(
            status_code=409,
            detail="A crawl is already in progress for this source.",
        ) from exc

    job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=500, detail="Crawl job not found after creation")

    from .job_queue import enqueue_crawl, wait_for_job_worker, worker_is_running

    if settings.enable_durable_jobs:
        enqueued = enqueue_crawl(str(job_id), str(source_id), user_id=user_id)
        if not enqueued:
            logger.error(
                "Failed to enqueue crawl job_id=%s source_id=%s trigger=%s",
                job_id,
                source_id,
                trigger.value,
            )
            raise HTTPException(
                status_code=503,
                detail="Could not enqueue crawl job. Try again shortly.",
            )

        if not worker_is_running():
            ready = wait_for_job_worker(timeout_sec=30.0)
            if not ready:
                logger.error(
                    "Background job worker not ready; crawl job_id=%s left PENDING",
                    job_id,
                )
                return CrawlStartResult(
                    job_id=job.id,
                    queued_at=job.queued_at,
                    message=(
                        "Crawl job queued; background worker is starting. "
                        "Poll status until RUNNING."
                    ),
                    enqueue_status="pending_worker",
                    http_status=202,
                )

        logger.info(
            "Crawl enqueued job_id=%s source_id=%s trigger=%s",
            job_id,
            source_id,
            trigger.value,
        )
        return CrawlStartResult(
            job_id=job.id,
            queued_at=job.queued_at,
            message="Crawl job enqueued",
            http_status=200,
        )

    # Durable jobs disabled (local dev): single inline execution only.
    if run_inline_fallback:
        asyncio.create_task(run_crawl(job_id, source_id))
        logger.info(
            "Crawl started inline (durable jobs off) job_id=%s trigger=%s",
            job_id,
            trigger.value,
        )
    return CrawlStartResult(
        job_id=job.id,
        queued_at=job.queued_at,
        message="Crawl job started",
        http_status=200,
    )
