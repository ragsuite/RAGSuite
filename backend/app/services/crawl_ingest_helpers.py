"""Helpers for multi-batch crawl indexing progress and user-facing status."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ..models import BackgroundJob, BackgroundJobStatus, CrawlJob, CrawlJobStatus, CrawlSource
from .llm_error_messages import format_embed_error_for_crawl
from .notification_service import create_notification


def _is_crawl_meta_entry(entry: Any, meta_type: str) -> bool:
    return isinstance(entry, dict) and entry.get("type") == meta_type


def _errors_without_meta(errors: Optional[list], *meta_types: str) -> list:
    if not isinstance(errors, list):
        return []
    skip = set(meta_types)
    return [e for e in errors if not (isinstance(e, dict) and e.get("type") in skip)]


def init_indexing_progress(errors: Optional[list], total_batches: int) -> list:
    cleaned = _errors_without_meta(errors, "indexing_progress", "indexing_wait")
    cleaned.append(
        {
            "type": "indexing_progress",
            "batches_total": int(total_batches),
            "completed_batches": [],
        }
    )
    return cleaned


def get_indexing_progress(errors: Optional[list]) -> Optional[dict]:
    if not isinstance(errors, list):
        return None
    for entry in errors:
        if _is_crawl_meta_entry(entry, "indexing_progress"):
            return entry
    return None


def crawl_progress_percentage(job: CrawlJob, *, max_pages: Optional[int] = None) -> float:
    """Real-time crawl/index progress for UI (0–100).

    Crawl fetch uses pages_fetched vs max_pages (capped below 90 so indexing
    can advance). Indexing uses completed ingest batches when available —
    never a fake stuck 95% while batches are still running.
    """
    if not job:
        return 0.0

    if job.status == CrawlJobStatus.COMPLETED:
        return 100.0
    if job.status in (CrawlJobStatus.FAILED, CrawlJobStatus.CANCELLED):
        return 0.0
    if job.status in (CrawlJobStatus.PENDING, CrawlJobStatus.WAITING):
        return 0.0

    if job.status == CrawlJobStatus.INDEXING:
        progress = get_indexing_progress(job.errors)
        if progress:
            total = int(progress.get("batches_total") or 0)
            done = len(progress.get("completed_batches") or [])
            if total > 0:
                # Crawl phase ≈ 85%; indexing fills 85 → 99 until COMPLETED → 100.
                frac = min(1.0, max(0.0, done / total))
                return round(85.0 + (14.0 * frac), 1)
        # Indexing started but batch metadata not ready yet.
        return 88.0

    if job.status == CrawlJobStatus.RUNNING:
        cap = max_pages if max_pages and max_pages > 0 else 5000
        fetched = int(job.pages_fetched or 0)
        if fetched <= 0:
            return 0.0
        # Leave headroom for the indexing phase (max ~85% while still crawling).
        pct = min(85.0, max(1.0, (fetched / cap) * 85.0))
        return round(pct, 1)

    return 0.0


def set_indexing_wait(errors: Optional[list], message: str) -> list:
    cleaned = _errors_without_meta(errors, "indexing_wait")
    cleaned.append(
        {
            "type": "indexing_wait",
            "message": message,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    return cleaned


EMPTY_CONTENT_CRAWL_MESSAGE = (
    "No usable text was found. This site likely needs Headless On so the page can load before crawling."
)


def _is_empty_content_crawl_error(err: str) -> bool:
    lower = err.lower()
    return (
        "no text extracted" in lower
        or "no pages saved" in lower
        or "no vectors indexed" in lower
    )


def crawl_status_message_from_job(job: CrawlJob) -> str:
    if not job:
        return ""
    if job.status == CrawlJobStatus.RUNNING:
        pages = job.pages_fetched or 0
        return f"Crawling in progress ({pages} pages saved so far)."
    if job.status == CrawlJobStatus.INDEXING:
        if isinstance(job.errors, list):
            for entry in job.errors:
                if _is_crawl_meta_entry(entry, "indexing_wait"):
                    return str(
                        entry.get("message")
                        or "Waiting for embedding service — will continue automatically."
                    )
        progress = get_indexing_progress(job.errors)
        if progress:
            done = len(progress.get("completed_batches") or [])
            total = int(progress.get("batches_total") or 0)
            if total > 0:
                return f"Indexing crawled content ({done}/{total} batches complete)..."
        return "Indexing crawled content into search..."
    if job.status == CrawlJobStatus.COMPLETED:
        return "Crawl and indexing completed successfully."
    if job.status == CrawlJobStatus.FAILED:
        if isinstance(job.errors, list):
            for entry in reversed(job.errors):
                if isinstance(entry, dict) and entry.get("error"):
                    err = str(entry["error"])
                    if _is_empty_content_crawl_error(err):
                        return EMPTY_CONTENT_CRAWL_MESSAGE
                    if err.startswith("Indexing failed:"):
                        return err
                    return format_embed_error_for_crawl(err)
        return "Crawl failed. Check job details and try again."
    if job.status == CrawlJobStatus.WAITING:
        return "Crawl is queued — waiting for an available crawl slot."
    if job.status == CrawlJobStatus.PENDING:
        return "Crawl is queued and will start shortly."
    return ""


def _completed_batch_indices_from_bg_jobs(db: Session, crawl_job_id: uuid.UUID) -> List[int]:
    """Source of truth when parallel workers race on JSON progress updates."""
    rows = (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.job_type == "CRAWL_INGEST_BATCH",
            BackgroundJob.status == BackgroundJobStatus.COMPLETED.value,
        )
        .all()
    )
    indices: List[int] = []
    job_key = str(crawl_job_id)
    for row in rows:
        payload = row.payload or {}
        if str(payload.get("crawl_job_id")) != job_key:
            continue
        try:
            indices.append(int(payload.get("batch_index", -1)))
        except (TypeError, ValueError):
            continue
    return sorted({i for i in indices if i >= 0})


def record_crawl_ingest_batch_success(
    db: Session,
    *,
    crawl_job_id: uuid.UUID,
    source_id: uuid.UUID,
    batch_index: int,
    total_batches: int,
    chunks: int,
) -> None:
    job = (
        db.query(CrawlJob)
        .filter(CrawlJob.id == crawl_job_id)
        .with_for_update()
        .first()
    )
    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
    if not job or not source:
        return
    if job.status == CrawlJobStatus.FAILED:
        return

    progress = get_indexing_progress(job.errors) or {
        "type": "indexing_progress",
        "batches_total": total_batches,
        "completed_batches": [],
    }
    completed = list(progress.get("completed_batches") or [])
    if batch_index not in completed:
        completed.append(batch_index)
    # Merge with completed background jobs to survive parallel batch workers.
    completed = sorted(
        set(completed) | set(_completed_batch_indices_from_bg_jobs(db, crawl_job_id))
    )
    progress["batches_total"] = max(int(total_batches), int(progress.get("batches_total") or 0))
    progress["completed_batches"] = completed

    errors = _errors_without_meta(job.errors, "indexing_progress", "indexing_wait")
    errors.append(progress)
    job.errors = errors
    flag_modified(job, "errors")
    job.status = CrawlJobStatus.INDEXING

    now = datetime.now(timezone.utc)
    batches_total = int(progress["batches_total"])
    if batches_total > 0 and len(completed) >= batches_total:
        job.status = CrawlJobStatus.COMPLETED
        job.finished_at = now
        source.trained_at = now
        db.commit()
        try:
            create_notification(
                db=db,
                user_id=source.created_by_id,
                title="Crawl Job Completed",
                message=(
                    f"Crawled and indexed {job.pages_fetched or 0} pages "
                    f"from {source.base_url}"
                ),
                type="success",
                action_url="/crawl",
            )
        except Exception:
            pass
        try:
            from .concurrency_limits import promote_all_waiting_for_user

            if source.created_by_id:
                promote_all_waiting_for_user(db, source.created_by_id)
        except Exception:
            pass
    else:
        db.commit()


def fail_crawl_job_indexing(
    db: Session,
    *,
    crawl_job_id: uuid.UUID,
    source_id: uuid.UUID,
    raw_error: str,
) -> None:
    job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
    if not job:
        return

    friendly = format_embed_error_for_crawl(raw_error)
    now = datetime.now(timezone.utc)
    if job.status != CrawlJobStatus.FAILED:
        job.status = CrawlJobStatus.FAILED
        job.finished_at = now
        errs = _errors_without_meta(job.errors, "indexing_wait")
        errs.append(
            {
                "error": f"Indexing failed: {friendly}",
                "raw_error": raw_error[:500],
                "timestamp": now.isoformat(),
            }
        )
        job.errors = errs
        db.commit()

    if source and source.created_by_id:
        try:
            create_notification(
                db=db,
                user_id=source.created_by_id,
                title="Crawl Job Failed",
                message=f"Crawl for {source.base_url} failed during indexing: {friendly}",
                type="error",
                action_url="/crawl",
            )
        except Exception:
            pass
        try:
            from .concurrency_limits import promote_all_waiting_for_user

            promote_all_waiting_for_user(db, source.created_by_id)
        except Exception:
            pass


def mark_crawl_indexing_wait(
    db: Session,
    *,
    crawl_job_id: uuid.UUID,
    message: Optional[str] = None,
) -> None:
    job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
    if not job or job.status == CrawlJobStatus.FAILED:
        return
    text = message or (
        "Waiting for embedding service — will continue automatically."
    )
    job.status = CrawlJobStatus.INDEXING
    job.errors = set_indexing_wait(job.errors, text)
    db.commit()


def maybe_finalize_crawl_indexing_if_batches_done(
    db: Session,
    *,
    crawl_job_id: uuid.UUID,
) -> bool:
    """Repair/finalize when all ingest batches completed but crawl job stuck on INDEXING."""
    job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
    if not job or job.status != CrawlJobStatus.INDEXING:
        return False

    progress = get_indexing_progress(job.errors) or {}
    total = int(progress.get("batches_total") or 0)
    if total <= 0:
        return False

    completed = _completed_batch_indices_from_bg_jobs(db, crawl_job_id)
    if len(completed) < total:
        return False

    source = db.query(CrawlSource).filter(CrawlSource.id == job.source_id).first()
    if not source:
        return False

    record_crawl_ingest_batch_success(
        db,
        crawl_job_id=crawl_job_id,
        source_id=source.id,
        batch_index=completed[-1],
        total_batches=total,
        chunks=1,
    )
    db.refresh(job)
    return job.status == CrawlJobStatus.COMPLETED
