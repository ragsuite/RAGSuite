"""Per-project limits on heavy background operations."""
from __future__ import annotations

import logging
import uuid
from typing import Optional, Union

from sqlalchemy.orm import Session

from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType, CrawlJob, CrawlJobStatus
from ..settings import settings

logger = logging.getLogger(__name__)

# Statuses that actually consume a concurrency slot (WAITING is queued, not running)
_SLOT_CONSUMING_STATUSES = (
    CrawlJobStatus.PENDING,
    CrawlJobStatus.RUNNING,
    CrawlJobStatus.INDEXING,
)

# Statuses that mean "source is busy" — cannot start a new job for same source
_BUSY_STATUSES = (
    CrawlJobStatus.PENDING,
    CrawlJobStatus.RUNNING,
    CrawlJobStatus.INDEXING,
    CrawlJobStatus.WAITING,
)


def _active_crawl_jobs_for_project(db: Session, project_id: uuid.UUID) -> int:
    """Count slot-consuming crawl jobs for a project (WAITING excluded)."""
    from ..models import CrawlSource

    return (
        db.query(CrawlJob)
        .join(CrawlSource, CrawlJob.source_id == CrawlSource.id)
        .filter(
            CrawlSource.project_id == project_id,
            CrawlJob.status.in_(_SLOT_CONSUMING_STATUSES),
        )
        .count()
    )


def _active_reindex_jobs_for_project(db: Session, project_id: uuid.UUID) -> int:
    from ..models import ReindexJob

    return (
        db.query(ReindexJob)
        .filter(
            ReindexJob.project_id == project_id,
            ReindexJob.status == "running",
        )
        .count()
    )


def assert_can_start_crawl(db: Session, project_id: uuid.UUID) -> None:
    cap = int(settings.max_concurrent_crawls_per_project or 0)
    if cap <= 0:
        return
    active = _active_crawl_jobs_for_project(db, project_id)
    if active >= cap:
        raise ValueError(
            f"Concurrent crawl limit reached ({cap}) for this project. "
            "Wait for an in-progress crawl to finish."
        )


def notify_crawl_slots_full(db: Session, user_id: int, *, source_name: str | None = None) -> None:
    """In-app notification when the project cannot start another crawl."""
    from .notification_service import create_notification

    cap = int(settings.max_concurrent_crawls_per_project or 0)
    cap_label = str(cap) if cap > 0 else "available"
    site_hint = f" for {source_name}" if source_name else ""
    try:
        create_notification(
            db=db,
            user_id=user_id,
            title="Crawl slots full",
            message=(
                f"All {cap_label} crawl slots are in use{site_hint} for this project. "
                "Your crawl has been queued and will start automatically when a slot opens."
            ),
            type="warning",
            action_url="/crawl",
        )
    except Exception as exc:
        logger.warning("Failed to create crawl-limit notification for user %s: %s", user_id, exc)


def assert_can_start_reindex(db: Session, project_id: uuid.UUID) -> None:
    cap = int(settings.max_concurrent_reindexes_per_project or 0)
    if cap <= 0:
        return
    active = _active_reindex_jobs_for_project(db, project_id)
    if active >= cap:
        raise ValueError(
            f"Concurrent reindex limit reached ({cap}) for this project. "
            "Wait for the current reindex to finish."
        )


def source_has_active_crawl(db: Session, source_id: uuid.UUID) -> bool:
    """True when source has a running OR waiting job — prevents double-queuing."""
    return (
        db.query(CrawlJob)
        .filter(
            CrawlJob.source_id == source_id,
            CrawlJob.status.in_(_BUSY_STATUSES),
        )
        .first()
        is not None
    )


def _promote_waiting_crawl_for_project(db: Session, project_id: uuid.UUID, user_id: Optional[int] = None) -> bool:
    """
    Promote the oldest WAITING crawl for a project to PENDING and enqueue it.
    Returns True if a job was promoted.
    Uses SELECT FOR UPDATE SKIP LOCKED to prevent double-promotion races.
    """
    cap = int(settings.max_concurrent_crawls_per_project or 0)
    if cap > 0 and _active_crawl_jobs_for_project(db, project_id) >= cap:
        return False

    from ..models import CrawlSource

    waiting_job = (
        db.query(CrawlJob)
        .join(CrawlSource, CrawlJob.source_id == CrawlSource.id)
        .filter(
            CrawlSource.project_id == project_id,
            CrawlJob.status == CrawlJobStatus.WAITING,
        )
        .order_by(CrawlJob.queued_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )

    if not waiting_job:
        return False

    waiting_job.status = CrawlJobStatus.PENDING
    db.commit()

    enqueue_user_id = user_id
    if enqueue_user_id is None:
        # Resolve user_id from source for enqueue metadata
        try:
            src = db.query(CrawlSource).filter(CrawlSource.id == waiting_job.source_id).first()
            if src:
                enqueue_user_id = src.created_by_id
        except Exception:
            pass

    try:
        from .job_queue import enqueue_crawl
        enqueue_crawl(str(waiting_job.id), str(waiting_job.source_id), user_id=enqueue_user_id)
        logger.info(
            "crawl_queue: promoted WAITING job %s (source %s, project %s) → PENDING",
            waiting_job.id,
            waiting_job.source_id,
            project_id,
        )
    except Exception as exc:
        logger.error(
            "crawl_queue: failed to enqueue promoted job %s: %s — job stays PENDING, worker will pick it up",
            waiting_job.id,
            exc,
        )

    return True


def promote_all_waiting_for_project(db: Session, project_id: uuid.UUID, user_id: Optional[int] = None) -> int:
    """
    Promote all eligible WAITING crawls for a project (loop until slots full or none left).
    Returns number of jobs promoted.
    """
    cap = max(1, int(settings.max_concurrent_crawls_per_project or 2))
    promoted = 0
    while promoted < cap:
        if not _promote_waiting_crawl_for_project(db, project_id, user_id=user_id):
            break
        promoted += 1
    if promoted:
        logger.info(
            "crawl_queue: promoted %d WAITING crawl(s) for project %s",
            promoted,
            project_id,
        )
    try:
        from ..models import CrawlSource
        remaining = (
            db.query(CrawlJob)
            .join(CrawlSource, CrawlJob.source_id == CrawlSource.id)
            .filter(
                CrawlSource.project_id == project_id,
                CrawlJob.status == CrawlJobStatus.WAITING,
            )
            .count()
        )
        threshold = int(settings.waiting_crawl_alert_threshold or 10)
        if remaining >= threshold:
            logger.warning(
                "crawl_queue: project %s has %d WAITING crawls queued (threshold=%d)",
                project_id,
                remaining,
                threshold,
            )
    except Exception as exc:
        logger.debug("crawl_queue: could not count remaining WAITING crawls: %s", exc)
    return promoted


# ---------------------------------------------------------------------------
# Shim: kept for backward compat — all callers (job_queue, scheduler, crawler)
# pass user_id. We find their projects with WAITING crawls and promote per-project.
# ---------------------------------------------------------------------------
def promote_waiting_crawls(db: Session, user_id: int) -> bool:
    """Backward-compat shim: promotes one WAITING crawl across all projects for user."""
    from ..models import CrawlSource

    projects = (
        db.query(CrawlSource.project_id)
        .join(CrawlJob, CrawlJob.source_id == CrawlSource.id)
        .filter(
            CrawlJob.status == CrawlJobStatus.WAITING,
            CrawlSource.created_by_id == user_id,
        )
        .distinct()
        .all()
    )
    for (pid,) in projects:
        if _promote_waiting_crawl_for_project(db, pid, user_id=user_id):
            return True
    return False


def promote_all_waiting_for_user(db: Session, user_id: int) -> int:
    """Backward-compat shim: promotes WAITING crawls across all projects for user."""
    from ..models import CrawlSource

    projects = (
        db.query(CrawlSource.project_id)
        .join(CrawlJob, CrawlJob.source_id == CrawlSource.id)
        .filter(
            CrawlJob.status == CrawlJobStatus.WAITING,
            CrawlSource.created_by_id == user_id,
        )
        .distinct()
        .all()
    )
    total = 0
    for (pid,) in projects:
        total += promote_all_waiting_for_project(db, pid, user_id=user_id)
    return total
