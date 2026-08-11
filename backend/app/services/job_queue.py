"""
Postgres-backed durable job queue with an in-process worker loop (or standalone worker module).
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import (
    BackgroundJob,
    BackgroundJobStatus,
    BackgroundJobType,
    CrawlJob,
    CrawlJobStatus,
    UploadedDocument,
)
from ..settings import settings
from .indexing_job_types import INDEXING_JOB_TYPES

logger = logging.getLogger(__name__)

_worker_threads: List[threading.Thread] = []
_worker_lock = threading.Lock()
_worker_started = threading.Event()
_worker_db_lock = threading.Lock()
_worker_db_state: Dict[str, float] = {
    "backoff_until": 0.0,
    "last_log_at": 0.0,
    "consecutive_failures": 0.0,
}
_DB_UNAVAILABLE_MARKERS = (
    "recovery mode",
    "not yet accepting connections",
    "connection refused",
    "could not connect",
    "no space left on device",
    "server closed the connection unexpectedly",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _is_db_unavailable_error(exc: BaseException) -> bool:
    """True when Postgres (or the pool) is temporarily unreachable."""
    if isinstance(exc, OperationalError):
        return True
    msg = str(getattr(exc, "orig", exc)).lower()
    return any(marker in msg for marker in _DB_UNAVAILABLE_MARKERS)


def _record_db_unavailable(exc: BaseException, *, poll_seconds: float) -> float:
    """Track shared backoff and emit one throttled warning across worker threads."""
    with _worker_db_lock:
        now = time.monotonic()
        failures = int(_worker_db_state["consecutive_failures"]) + 1
        _worker_db_state["consecutive_failures"] = float(failures)
        delay = min(30.0, poll_seconds * (2 ** min(failures - 1, 5)))
        _worker_db_state["backoff_until"] = now + delay
        if now - _worker_db_state["last_log_at"] >= 30.0:
            _worker_db_state["last_log_at"] = now
            logger.warning(
                "Database unavailable; background job workers backing off (%.0fs): %s",
                delay,
                exc,
            )
        return delay


def _clear_db_unavailable() -> None:
    with _worker_db_lock:
        if _worker_db_state["consecutive_failures"] > 0:
            logger.info("Database connection restored for background job workers")
        _worker_db_state["consecutive_failures"] = 0.0
        _worker_db_state["backoff_until"] = 0.0


def _worker_db_backoff_remaining() -> float:
    with _worker_db_lock:
        return max(0.0, _worker_db_state["backoff_until"] - time.monotonic())


def enqueue_job(
    db: Session,
    *,
    job_type: str,
    payload: Dict[str, Any],
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
    idempotency_key: Optional[str] = None,
    priority: int = 0,
    job_class: Optional[str] = None,
) -> BackgroundJob:
    if idempotency_key:
        existing = (
            db.query(BackgroundJob)
            .filter(BackgroundJob.idempotency_key == idempotency_key)
            .first()
        )
        if existing:
            if existing.status in (
                BackgroundJobStatus.PENDING.value,
                BackgroundJobStatus.RUNNING.value,
            ):
                return existing
            # Terminal jobs keep a unique idempotency_key in DB — release before re-enqueue.
            existing.idempotency_key = None
            db.commit()

    row = BackgroundJob(
        job_type=job_type,
        status=BackgroundJobStatus.PENDING.value,
        user_id=user_id,
        project_id=project_id,
        payload=payload,
        idempotency_key=idempotency_key,
        priority=priority,
        job_class=job_class,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def enqueue_purge_crawl_source(source_id: str, user_id: Optional[int] = None) -> bool:
    """Queue vector purge; returns True if queued (caller should skip sync delete)."""
    if not settings.enable_durable_jobs:
        return False
    db = SessionLocal()
    try:
        enqueue_job(
            db,
            job_type=BackgroundJobType.PURGE_CRAWL_SOURCE.value,
            payload={"source_id": source_id},
            user_id=user_id,
            idempotency_key=f"purge_crawl_source:{source_id}",
        )
        return True
    finally:
        db.close()


def enqueue_purge_uploaded_document(
    document_id: str, pattern: Optional[str] = None
) -> bool:
    if not settings.enable_durable_jobs:
        return False
    db = SessionLocal()
    try:
        enqueue_job(
            db,
            job_type=BackgroundJobType.PURGE_UPLOADED_DOCUMENT.value,
            payload={"document_id": document_id, "pattern": pattern},
            idempotency_key=f"purge_doc:{document_id}",
        )
        return True
    finally:
        db.close()


def enqueue_document_ingest(
    document_id: str,
    staging_path: str,
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
) -> bool:
    if not settings.enable_durable_jobs:
        return False
    db = SessionLocal()
    try:
        enqueue_job(
            db,
            job_type=BackgroundJobType.DOCUMENT_INGEST.value,
            payload={
                "document_id": document_id,
                "staging_path": staging_path,
            },
            user_id=user_id,
            project_id=project_id,
            idempotency_key=f"document_ingest:{document_id}",
        )
        from .admission import ingest_queued_incr

        if project_id:
            ingest_queued_incr(project_id)
        return True
    finally:
        db.close()


_CRAWL_FETCH_JOB_TYPES = (
    BackgroundJobType.CRAWL.value,
    BackgroundJobType.CRAWL_FETCH.value,
)


def enqueue_crawl(crawl_job_id: str, source_id: str, user_id: Optional[int] = None) -> bool:
    if not settings.enable_durable_jobs:
        return False
    db = SessionLocal()
    try:
        enqueue_job(
            db,
            job_type=BackgroundJobType.CRAWL_FETCH.value,
            payload={"crawl_job_id": crawl_job_id, "source_id": source_id},
            user_id=user_id,
            idempotency_key=f"crawl:{crawl_job_id}",
        )
        return True
    finally:
        db.close()


def _count_running_crawls(db: Session) -> int:
    """Count CRAWL / CRAWL_FETCH jobs currently RUNNING across all workers."""
    return (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
            BackgroundJob.job_type.in_(_CRAWL_FETCH_JOB_TYPES),
        )
        .count()
    )


def _count_running_ingest_for_project(db: Session, project_id: uuid.UUID) -> int:
    """Count RUNNING indexing jobs for a specific project."""
    return (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.project_id == project_id,
            BackgroundJob.job_type.in_(INDEXING_JOB_TYPES),
            BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
        )
        .count()
    )


def count_active_ingest_for_project(db: Session, project_id: uuid.UUID) -> int:
    """Count PENDING + RUNNING indexing jobs for a project (for enqueue-time cap)."""
    from .admission import get_ingest_queued

    return get_ingest_queued(project_id, db=db)


def _get_org_cap(db: Session, user_id: Optional[int], cap_field: str, global_val: int) -> int:
    """Return org-level cap for cap_field, falling back to global_val if not set."""
    if not user_id:
        return global_val
    try:
        from ..models import Organization, User

        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.org_id:
            return global_val
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if not org:
            return global_val
        org_cap = getattr(org, cap_field, 0)
        return org_cap if org_cap > 0 else global_val
    except Exception:
        return global_val


get_org_cap = _get_org_cap


def _claim_next_jobs(db: Session, limit: int) -> list[BackgroundJob]:
    """
    Fair-queue claim: round-robin by user_id, with crawl worker cap and
    per-project ingest cap enforced at claim time.

    Algorithm:
      1. Get tenant user_ids ordered by their oldest PENDING job (fairness).
      2. Claim one job per tenant per tick (round-robin, SKIP LOCKED).
      3. Skip CRAWL jobs when crawl cap is reached.
      4. Skip DOCUMENT_INGEST jobs when project concurrent cap is reached.
      5. Fill remaining slots from system jobs (user_id IS NULL), FIFO.

    Composite indexes required (see migration add_fair_queue_indexes):
      - idx_bg_jobs_status_user_queued ON background_jobs(status, user_id, queued_at)
      - idx_bg_jobs_project_ingest ON background_jobs(project_id, job_type, status)
    """
    from sqlalchemy import text

    from .admission import get_crawl_running, get_ingest_active

    crawl_cap = max(1, int(settings.job_worker_crawl_threads))
    crawl_cap_reached = get_crawl_running(db=db) >= crawl_cap

    global_ingest_concurrent_cap = max(0, int(settings.max_concurrent_ingest_per_project))

    # Step 1: tenant user_ids ordered by oldest PENDING job (fair round-robin).
    # GROUP BY is required — ORDER BY MIN(queued_at) is valid Postgres with GROUP BY.
    tenant_rows = db.execute(text("""
        SELECT user_id
        FROM background_jobs
        WHERE status = 'PENDING' AND user_id IS NOT NULL
          AND (retry_after IS NULL OR retry_after <= NOW())
        GROUP BY user_id
        ORDER BY MIN(queued_at)
        LIMIT :limit
    """), {"limit": limit}).fetchall()

    claimed: list[BackgroundJob] = []
    claimed_ids: set[uuid.UUID] = set()
    now = _utcnow()

    def _mark_claimed(job: BackgroundJob) -> None:
        job.status = BackgroundJobStatus.RUNNING.value
        job.started_at = now
        job.attempts = (job.attempts or 0) + 1
        claimed.append(job)
        claimed_ids.add(job.id)
        from .admission import crawl_running_incr, ingest_active_incr

        if job.job_type in _CRAWL_FETCH_JOB_TYPES:
            crawl_running_incr()
        elif job.job_type in INDEXING_JOB_TYPES and job.project_id:
            ingest_active_incr(job.project_id)

    # Step 2: claim one job per tenant (round-robin).
    # at_cap_ingest_projects: projects whose DOCUMENT_INGEST slots are full this tick.
    # Shared across users so the exclusion filter grows as we discover more at-cap projects.
    at_cap_ingest_projects: set = set()

    for (uid,) in tenant_rows:
        if len(claimed) >= limit:
            break

        ingest_concurrent_cap = _get_org_cap(
            db,
            uid,
            "max_concurrent_ingest_per_project",
            global_ingest_concurrent_cap,
        )

        # Retry loop: if the first eligible job is at an ingest cap, exclude that
        # project and try again for the same user. This prevents CRAWL_FETCH jobs
        # from being starved when all ingest slots are full.
        while True:
            query = (
                db.query(BackgroundJob)
                .filter(
                    BackgroundJob.status == BackgroundJobStatus.PENDING.value,
                    BackgroundJob.user_id == uid,
                    BackgroundJob.id.notin_(list(claimed_ids)) if claimed_ids else True,
                    (BackgroundJob.retry_after.is_(None)) | (BackgroundJob.retry_after <= now),
                )
                .order_by(BackgroundJob.priority.desc(), BackgroundJob.queued_at.asc())
            )

            if crawl_cap_reached:
                query = query.filter(
                    BackgroundJob.job_type.notin_(_CRAWL_FETCH_JOB_TYPES)
                )

            # Exclude projects whose ingest slots are already full.
            if at_cap_ingest_projects and ingest_concurrent_cap > 0:
                from sqlalchemy import and_, not_
                query = query.filter(
                    ~and_(
                        BackgroundJob.job_type.in_(INDEXING_JOB_TYPES),
                        BackgroundJob.project_id.in_(list(at_cap_ingest_projects)),
                    )
                )

            job = query.with_for_update(skip_locked=True).first()
            if job is None:
                break  # no more eligible jobs for this user

            # Per-project ingest cap check.
            if (
                ingest_concurrent_cap > 0
                and job.job_type in INDEXING_JOB_TYPES
                and job.project_id is not None
            ):
                running = get_ingest_active(job.project_id, db=db)
                if running >= ingest_concurrent_cap:
                    logger.debug(
                        "claim: project %s ingest full (running=%d cap=%d) — retrying for other job types",
                        job.project_id,
                        running,
                        ingest_concurrent_cap,
                    )
                    at_cap_ingest_projects.add(job.project_id)
                    continue  # retry same user, excluding this project's ingest jobs

            _mark_claimed(job)
            logger.info(
                "Claimed background job id=%s type=%s user=%s attempt=%s",
                job.id,
                job.job_type,
                uid,
                job.attempts,
            )
            break  # claimed one job, move to next user

    # Step 3: fill remaining slots with system jobs (user_id IS NULL), FIFO.
    remaining = limit - len(claimed)
    if remaining > 0:
        sys_query = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.status == BackgroundJobStatus.PENDING.value,
                BackgroundJob.user_id.is_(None),
                (BackgroundJob.retry_after.is_(None)) | (BackgroundJob.retry_after <= now),
            )
            .order_by(BackgroundJob.priority.desc(), BackgroundJob.queued_at.asc())
        )
        if crawl_cap_reached:
            sys_query = sys_query.filter(
                BackgroundJob.job_type.notin_(_CRAWL_FETCH_JOB_TYPES)
            )
        for job in sys_query.limit(remaining).with_for_update(skip_locked=True).all():
            _mark_claimed(job)
            logger.info(
                "Claimed system background job id=%s type=%s attempt=%s",
                job.id,
                job.job_type,
                job.attempts,
            )

    if claimed:
        db.commit()

    if crawl_cap_reached and tenant_rows:
        logger.debug(
            "crawl cap reached (cap=%d) — CRAWL jobs skipped this tick",
            crawl_cap,
        )

    return claimed


def _finish_job(
    db: Session,
    job: BackgroundJob,
    *,
    status: str,
    result: Optional[dict] = None,
    error: Optional[str] = None,
) -> None:
    job.status = status
    job.result = result
    job.error = error
    job.finished_at = _utcnow()
    db.commit()
    from .admission import crawl_running_decr, ingest_active_decr, ingest_queued_decr

    if job.job_type in _CRAWL_FETCH_JOB_TYPES:
        crawl_running_decr()
    elif job.job_type in INDEXING_JOB_TYPES and job.project_id:
        ingest_active_decr(job.project_id)
        ingest_queued_decr(job.project_id)


def _process_purge_crawl_source(payload: dict) -> None:
    from .rag.singleton import locked_delete_crawl_source_embeddings

    source_id = payload.get("source_id")
    if not source_id:
        raise ValueError("purge_crawl_source missing source_id")
    locked_delete_crawl_source_embeddings(str(source_id))


def _process_purge_uploaded_document(payload: dict) -> None:
    from .rag.singleton import locked_purge_document

    doc_id = payload.get("document_id")
    if not doc_id:
        raise ValueError("purge_uploaded_document missing document_id")
    locked_purge_document(
        str(doc_id),
        source_file_pattern=payload.get("pattern"),
    )


def _assert_crawl_job_tenant(payload: dict) -> None:
    """Refuse crawl execution when job.user_id does not own the crawl source."""
    job_user_id = payload.get("_job_user_id")
    if job_user_id is None:
        return
    source_id = uuid.UUID(str(payload["source_id"]))
    db = SessionLocal()
    try:
        from ..models import CrawlSource

        source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
        if source is None:
            raise ValueError(f"Crawl source {source_id} not found")
        if source.created_by_id is not None and int(source.created_by_id) != int(job_user_id):
            raise ValueError(
                f"Tenant mismatch: job claimed by user {job_user_id} but source {source_id} "
                f"belongs to user {source.created_by_id}"
            )
    finally:
        db.close()


async def _process_crawl(payload: dict) -> None:
    from .crawler import run_crawl

    _assert_crawl_job_tenant(payload)
    crawl_job_id = uuid.UUID(str(payload["crawl_job_id"]))
    source_id = uuid.UUID(str(payload["source_id"]))
    await run_crawl(crawl_job_id, source_id)


async def _process_crawl_fetch(payload: dict) -> None:
    from .crawler import run_crawl_fetch

    _assert_crawl_job_tenant(payload)
    crawl_job_id = uuid.UUID(str(payload["crawl_job_id"]))
    source_id = uuid.UUID(str(payload["source_id"]))
    await run_crawl_fetch(crawl_job_id, source_id)


def _process_crawl_ingest_batch(payload: dict) -> None:
    from .crawler import _direct_ingest_crawl_documents_subset
    from .crawl_ingest_helpers import record_crawl_ingest_batch_success

    source_id = uuid.UUID(str(payload["source_id"]))
    crawl_job_id = uuid.UUID(str(payload["crawl_job_id"]))
    document_ids: list[str] = payload.get("document_ids") or []
    batch_index = int(payload.get("batch_index", 0))
    total_batches = int(payload.get("total_batches", 1))

    if not document_ids:
        return

    result = _direct_ingest_crawl_documents_subset(source_id, document_ids)
    chunks = int(result.get("chunks", 0) or 0)
    if chunks <= 0:
        status = str(result.get("status") or "No chunks")
        from .embed_rate_limit import is_embed_rate_limit_error
        from .crawl_ingest_helpers import fail_crawl_job_indexing

        if not is_embed_rate_limit_error(status):
            db = SessionLocal()
            try:
                fail_crawl_job_indexing(
                    db,
                    crawl_job_id=crawl_job_id,
                    source_id=source_id,
                    raw_error=status,
                )
            finally:
                db.close()
            return
        raise ValueError(status)

    db = SessionLocal()
    try:
        record_crawl_ingest_batch_success(
            db,
            crawl_job_id=crawl_job_id,
            source_id=source_id,
            batch_index=batch_index,
            total_batches=total_batches,
            chunks=chunks,
        )
    finally:
        db.close()


def _parse_ingest_result(result: Any) -> tuple[str, int]:
    if isinstance(result, dict):
        chunks = int(result.get("chunks", 0) or 0)
        status = str(result.get("status") or "Indexed")
        if chunks == 0 and status.lower() in ("indexed", "index"):
            return "No Text Extracted", 0
        if chunks == 0:
            return status if status else "No Text Extracted", 0
        return status if status else "Indexed", chunks
    chunks = int(result) if result else 0
    return ("Indexed" if chunks > 0 else "No Text Extracted", chunks)


def _notify_document_ingest_outcome(
    db: Session,
    *,
    user_id: int,
    title: str,
    doc_status: str,
    chunks_count: int,
) -> None:
    from .notification_service import create_notification

    try:
        if doc_status == "Indexed" and chunks_count > 0:
            create_notification(
                db=db,
                user_id=user_id,
                title="Document Uploaded",
                message=(
                    f"Document '{title}' has been uploaded and indexed successfully "
                    f"with {chunks_count} chunks."
                ),
                type="success",
                action_url="/documents",
            )
        elif doc_status in {"Indexing Failed", "No Text Extracted", "Indexing Timed Out"}:
            create_notification(
                db=db,
                user_id=user_id,
                title="Document Upload Failed",
                message=(
                    f"Document '{title}' was uploaded but indexing failed. "
                    f"Status: {doc_status}"
                ),
                type="error",
                action_url="/documents",
            )
    except Exception as exc:
        logger.warning("Failed to create document ingest notification: %s", exc)


# Statuses that mean "actively being processed" — used by stale recovery.
INGEST_TRANSITIONAL_STATUSES = frozenset(["Queued", "Extracting", "Indexing"])


def _set_doc_status(db: Session, doc: "UploadedDocument", status: str) -> None:
    """Update doc status and commit immediately so frontend polling sees it."""
    doc.status = status
    db.commit()


def _process_document_ingest(payload: dict) -> None:
    import os
    from datetime import datetime, timezone

    from .db_vector_consistency import compensate_uploaded_document_on_db_failure
    from .document_ingest_orchestration import ingest_document_to_all_targets_sync
    from .ingest_runtime import run_ingest_sync

    document_id = payload.get("document_id")
    staging_path = payload.get("staging_path")
    if not document_id or not staging_path:
        raise ValueError("document_ingest missing document_id or staging_path")

    db = SessionLocal()
    staging_path = str(staging_path)
    try:
        doc = (
            db.query(UploadedDocument)
            .filter(UploadedDocument.id == uuid.UUID(str(document_id)))
            .first()
        )
        if not doc:
            # Document was deleted before worker picked it up — no-op, don't retry.
            logger.info("Document %s no longer exists, skipping ingest", document_id)
            return

        # Tenant assertion: job.user_id must match document owner.
        # Mismatch indicates a queue corruption bug — refuse rather than silently process.
        job_user_id = payload.get("_job_user_id")
        if job_user_id is not None and doc.user_id is not None and int(doc.user_id) != int(job_user_id):
            logger.error(
                "Tenant mismatch: job.user_id=%s doc.user_id=%s document_id=%s — refusing ingest",
                job_user_id, doc.user_id, document_id,
            )
            raise ValueError(
                f"Tenant mismatch: job claimed by user {job_user_id} but document {document_id} "
                f"belongs to user {doc.user_id}"
            )

        # Idempotency: locked_ingest replaces existing vectors under one write lock
        # *after* extract+embed succeeds. Do not delete here — a missing staging file
        # or extract failure used to wipe Indexed docs and leave status Failed.
        # Stage 1 — Extracting: worker has claimed job, reading & preparing file
        _set_doc_status(db, doc, "Extracting")

        if not os.path.isfile(staging_path):
            # Staging file deleted (e.g. after a failed first attempt).
            # Recover from text_content stored in DB if available.
            if doc.text_content:
                logger.info(
                    "Staging file missing for document %s — recovering from text_content in DB",
                    document_id,
                )
                staging_dir = os.path.dirname(staging_path)
                os.makedirs(staging_dir, exist_ok=True)
                with open(staging_path, "wb") as _f:
                    _f.write(bytes(doc.text_content))
            else:
                logger.warning("Staging file missing and no text_content for document %s", document_id)
                # Preserve Indexed status when vectors still exist — cannot re-run.
                if doc.status == "Indexed" and int(doc.chunks or 0) > 0:
                    db.commit()
                    return
                _set_doc_status(db, doc, "Indexing Failed")
                doc.chunks = 0
                db.commit()
                if doc.user_id:
                    _notify_document_ingest_outcome(
                        db,
                        user_id=doc.user_id,
                        title=doc.title,
                        doc_status="Indexing Failed",
                        chunks_count=0,
                    )
                return

        # Re-check document still exists before the heavy embedding step.
        # Catches deletes that arrive after Extracting started.
        db.expire(doc)
        doc = db.query(UploadedDocument).filter(UploadedDocument.id == uuid.UUID(str(document_id))).first()
        if not doc:
            logger.info("Document %s deleted during extraction, aborting ingest", document_id)
            return

        # Stage 2 — Indexing: embedding + storing in vector DB (Search + Chat if different)
        _set_doc_status(db, doc, "Indexing")

        try:
            doc_status, chunks_count = ingest_document_to_all_targets_sync(
                db,
                save_path=staging_path,
                document_id=str(document_id),
                user_id=doc.user_id,
                project_id=doc.project_id,
                run_ingest=run_ingest_sync,
            )
        except Exception as exc:
            from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

            if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
                logger.warning(
                    "Document ingest rate limited for %s — job will retry: %s",
                    document_id,
                    exc,
                )
                _set_doc_status(db, doc, "Indexing")
                raise
            logger.exception("Document ingest failed for %s: %s", document_id, exc)
            compensate_uploaded_document_on_db_failure(str(document_id))
            doc_status, chunks_count = "Indexing Failed", 0

        # Stage 3 — Final status
        doc.status = doc_status
        doc.chunks = chunks_count
        if doc_status == "Indexed" and chunks_count > 0:
            doc.indexed_at = datetime.now(timezone.utc)
        try:
            db.commit()
        except Exception as commit_exc:
            # Document was deleted mid-ingest (StaleDataError). Vectors already
            # written to ChromaDB — compensate to avoid orphaned embeddings.
            logger.warning(
                "Document %s deleted during ingest, rolling back status update: %s",
                document_id, commit_exc,
            )
            db.rollback()
            compensate_uploaded_document_on_db_failure(str(document_id))
            return

        if doc.user_id:
            _notify_document_ingest_outcome(
                db,
                user_id=doc.user_id,
                title=doc.title,
                doc_status=doc_status,
                chunks_count=chunks_count,
            )

        from .audit_service import refresh_document_upload_audit

        refresh_document_upload_audit(
            db,
            document_id=str(document_id),
            doc_status=doc_status,
            chunks_count=chunks_count,
        )
        if doc.project_id and doc_status == "Indexed" and chunks_count > 0:
            try:
                from .reindex_service import invalidate_item_embedding_coverage_cache

                invalidate_item_embedding_coverage_cache(str(doc.project_id))
            except Exception:
                pass
    finally:
        db.close()
        if staging_path and os.path.isfile(staging_path):
            try:
                os.remove(staging_path)
            except OSError as exc:
                logger.warning("Could not remove staging file %s: %s", staging_path, exc)


def _process_webhook_delivery(payload: dict) -> None:
    """Deliver a webhook event with SSRF protection and HMAC signature."""
    import hmac as _hmac
    import hashlib as _hashlib
    import json as _json
    import httpx as _httpx
    from ..security_utils import block_ssrf

    url = payload.get("url", "")
    event = payload.get("event", "event")
    data = payload.get("data", {})
    secret = payload.get("secret", "")
    webhook_id = payload.get("webhook_id", "")

    if not url:
        raise ValueError("webhook_delivery missing url")

    block_ssrf(url)

    body = _json.dumps({"event": event, "data": data, "webhook_id": webhook_id})
    sig = _hmac.new(secret.encode("utf-8"), body.encode("utf-8"), _hashlib.sha256).hexdigest()
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Signature": sig,
        "X-Webhook-Event": event,
    }

    resp = _httpx.post(url, content=body, headers=headers, timeout=10.0)
    if resp.status_code >= 400:
        raise ValueError(f"Webhook delivery failed: HTTP {resp.status_code} for {url}")
    logger.info("Webhook delivered: event=%s webhook_id=%s status=%s", event, webhook_id, resp.status_code)


def _process_reindex(payload: dict) -> None:
    """Process a single REINDEX background job (upload batch or crawl source)."""
    from .reindex_service import process_reindex_payload

    process_reindex_payload(payload)


def _process_gmail_sync(payload: dict) -> None:
    """Run Gmail sync for a single integration row."""
    integration_id = payload.get("integration_id")
    sync_job_id = payload.get("sync_job_id")
    if not integration_id or not sync_job_id:
        raise ValueError("gmail_sync missing integration_id or sync_job_id")
    # Late import avoids circular dependency (scheduler late-imports job_queue too).
    from .scheduler import _run_gmail_sync_thread
    _run_gmail_sync_thread(str(integration_id), str(sync_job_id))


def _process_connector_sync(payload: dict) -> None:
    integration_id = payload.get("integration_id")
    sync_job_id = payload.get("sync_job_id")
    connector_type = payload.get("connector_type")
    if not integration_id or not sync_job_id:
        raise ValueError("connector_sync missing integration_id or sync_job_id")
    if connector_type == "google_drive":
        from ..db import SessionLocal
        from .connectors.google_drive import run_google_drive_sync

        db = SessionLocal()
        try:
            run_google_drive_sync(db, str(integration_id), str(sync_job_id))
        finally:
            db.close()
    elif connector_type == "notion":
        from ..db import SessionLocal
        from .connectors.notion import run_notion_sync

        db = SessionLocal()
        try:
            run_notion_sync(db, str(integration_id), str(sync_job_id))
        finally:
            db.close()
    elif connector_type == "confluence":
        from ..db import SessionLocal
        from .connectors.confluence import run_confluence_sync

        db = SessionLocal()
        try:
            run_confluence_sync(db, str(integration_id), str(sync_job_id))
        finally:
            db.close()
    elif connector_type == "sharepoint":
        from ..db import SessionLocal
        from .connectors.sharepoint import run_sharepoint_sync

        db = SessionLocal()
        try:
            run_sharepoint_sync(db, str(integration_id), str(sync_job_id))
        finally:
            db.close()
    elif connector_type == "slack":
        from ..db import SessionLocal
        from .connectors.slack import run_slack_sync

        db = SessionLocal()
        try:
            run_slack_sync(db, str(integration_id), str(sync_job_id))
        finally:
            db.close()
    else:
        raise ValueError(f"Unsupported connector_sync type: {connector_type}")


def _process_purge_connector_integration(payload: dict) -> None:
    from ..db import SessionLocal
    from ..models import ConnectorIntegration
    from .connectors.framework import (
        purge_integration_documents,
        purge_integration_documents_by_id,
    )

    integration_id = payload.get("integration_id")
    project_id = payload.get("project_id")
    if not integration_id:
        raise ValueError("purge_connector missing integration_id")
    db = SessionLocal()
    try:
        integration = (
            db.query(ConnectorIntegration)
            .filter(ConnectorIntegration.id == uuid.UUID(str(integration_id)))
            .first()
        )
        if integration:
            purge_integration_documents(db, integration)
        elif project_id:
            purge_integration_documents_by_id(
                db,
                uuid.UUID(str(integration_id)),
                uuid.UUID(str(project_id)),
            )
    finally:
        db.close()


def enqueue_connector_sync_job(
    db: Session,
    *,
    integration_id: str,
    sync_job_id: str,
    connector_type: str,
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
) -> BackgroundJob:
    return enqueue_job(
        db,
        job_type=BackgroundJobType.CONNECTOR_SYNC.value,
        payload={
            "integration_id": integration_id,
            "sync_job_id": sync_job_id,
            "connector_type": connector_type,
        },
        user_id=user_id,
        project_id=project_id,
        idempotency_key=f"connector_sync:{integration_id}",
        priority=-1,
        job_class="connector",
    )


def _process_data_folder_ingest(payload: dict) -> None:
    """Ingest a single file from the data folder."""
    import os as _os
    from .ingest_runtime import run_ingest_sync
    from .rag.singleton import locked_ingest
    from .rag.embedding_resolver import resolve_ingest_for_project

    file_path = payload.get("file_path")
    project_id = payload.get("project_id")
    if not file_path:
        raise ValueError("data_folder_ingest missing file_path")
    if not _os.path.isfile(str(file_path)):
        logger.warning("data_folder_ingest: file no longer exists: %s", file_path)
        return

    emb_provider = payload.get("embedding_provider")
    emb_model = payload.get("embedding_model")
    emb_api_key = payload.get("embedding_api_key")

    if project_id and not emb_provider:
        db = SessionLocal()
        try:
            emb_provider, emb_model, emb_api_key = resolve_ingest_for_project(
                db, uuid.UUID(str(project_id))
            )
        finally:
            db.close()

    run_ingest_sync(
        locked_ingest,
        str(file_path),
        user_id=payload.get("user_id"),
        project_id=str(project_id) if project_id else None,
        embedding_provider=emb_provider,
        embedding_model=emb_model,
        embedding_api_key=emb_api_key,
    )


def _process_job_sync(job: BackgroundJob) -> None:
    # Inject job-level user_id so handlers can assert tenant ownership.
    # Use a private key to avoid colliding with payload fields.
    payload = dict(job.payload or {})
    if job.user_id is not None:
        payload["_job_user_id"] = job.user_id
    jtype = job.job_type
    if jtype == BackgroundJobType.PURGE_CRAWL_SOURCE.value:
        _process_purge_crawl_source(payload)
    elif jtype == BackgroundJobType.PURGE_UPLOADED_DOCUMENT.value:
        _process_purge_uploaded_document(payload)
    elif jtype == BackgroundJobType.CRAWL.value:
        asyncio.run(_process_crawl(payload))
    elif jtype == BackgroundJobType.CRAWL_FETCH.value:
        asyncio.run(_process_crawl_fetch(payload))
    elif jtype == BackgroundJobType.CRAWL_INGEST_BATCH.value:
        _process_crawl_ingest_batch(payload)
    elif jtype == BackgroundJobType.DOCUMENT_INGEST.value:
        _process_document_ingest(payload)
    elif jtype == BackgroundJobType.SEND_VERIFICATION_EMAIL.value:
        _process_send_verification_email(payload)
    elif jtype == BackgroundJobType.WEBHOOK_DELIVERY.value:
        _process_webhook_delivery(payload)
    elif jtype == BackgroundJobType.REINDEX.value:
        _process_reindex(payload)
    elif jtype == BackgroundJobType.GMAIL_SYNC.value:
        _process_gmail_sync(payload)
    elif jtype == BackgroundJobType.CONNECTOR_SYNC.value:
        _process_connector_sync(payload)
    elif jtype == BackgroundJobType.PURGE_CONNECTOR_INTEGRATION.value:
        _process_purge_connector_integration(payload)
    elif jtype == BackgroundJobType.DATA_FOLDER_INGEST.value:
        _process_data_folder_ingest(payload)
    else:
        raise ValueError(f"Unknown background job type: {jtype}")


def _process_send_verification_email(payload: dict) -> None:
    from .transactional_email import send_verification_otp_email
    import hmac, hashlib

    to_email = payload.get("to_email")
    otp_hmac = payload.get("otp_hmac")  # HMAC of OTP — never store raw OTP
    if not to_email or not otp_hmac:
        raise ValueError("send_verification_email missing to_email or otp_hmac")
    # otp_hmac is stored only for idempotency dedup; actual send already happened inline.
    # This job is a no-op retry guard — real email sent synchronously before enqueue.
    logger.info("Verification email job processed for %s (email sent inline at enqueue time)", to_email)


def enqueue_verification_email(
    db: Session,
    *,
    user_id: int,
    to_email: str,
    username: str,
    raw_otp: str,
) -> bool:
    """
    Send verification email immediately (synchronous) then record a sentinel job for
    audit/idempotency. The raw OTP is NEVER stored in the job payload.
    Returns True if email was sent.
    """
    import hmac as _hmac
    import hashlib as _hashlib

    # Send email NOW — before touching the job queue.
    try:
        from .transactional_email import send_verification_otp_email
        send_verification_otp_email(
            to_email=to_email,
            otp_code=raw_otp,
            username=username,
        )
    except Exception as exc:
        logger.error("Failed to send verification email to %s: %s", to_email, exc)
        return False

    if not settings.enable_durable_jobs:
        return True

    # Store only an HMAC fingerprint — not the raw OTP — for idempotency tracking.
    _secret = (settings.jwt_secret_key or "").encode()
    otp_hmac = _hmac.new(_secret, raw_otp.encode(), _hashlib.sha256).hexdigest()[:16]

    try:
        enqueue_job(
            db,
            job_type=BackgroundJobType.SEND_VERIFICATION_EMAIL.value,
            payload={
                "to_email": to_email,
                "username": username,
                "otp_hmac": otp_hmac,   # fingerprint only — NOT the raw OTP
            },
            user_id=user_id,
            idempotency_key=f"verify_email:{user_id}:{otp_hmac}",
        )
    except Exception as exc:
        logger.warning("Could not record verification email job (email already sent): %s", exc)

    return True


def deliver_webhook_event(
    db: Session,
    *,
    webhook_id: str,
    url: str,
    secret: str,
    event: str,
    data: Dict[str, Any],
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
) -> bool:
    """Enqueue async webhook delivery. Returns False if durable jobs disabled."""
    if not settings.enable_durable_jobs:
        return False
    enqueue_job(
        db,
        job_type=BackgroundJobType.WEBHOOK_DELIVERY.value,
        payload={
            "webhook_id": webhook_id,
            "url": url,
            "secret": secret,
            "event": event,
            "data": data,
        },
        user_id=user_id,
        project_id=project_id,
    )
    return True


def enqueue_reindex_batches(
    db: Session,
    *,
    project_id: uuid.UUID,
    document_ids: List[str],
    source: str = "search",
    user_id: Optional[int] = None,
    include_crawled: bool = True,
) -> int:
    """Enqueue durable reindex work (upload batches + optional crawl sources). Returns job count."""
    from .reindex_service import enqueue_durable_reindex

    _, job_count = enqueue_durable_reindex(
        db,
        project_id=project_id,
        source=source,
        user_id=user_id,
        document_ids=document_ids,
        include_crawled=include_crawled,
    )
    return job_count


def enqueue_gmail_sync(
    db: Session,
    *,
    integration_id: str,
    sync_job_id: str,
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
) -> BackgroundJob:
    """Enqueue a single GMAIL_SYNC job for one integration."""
    return enqueue_job(
        db,
        job_type=BackgroundJobType.GMAIL_SYNC.value,
        payload={"integration_id": integration_id, "sync_job_id": sync_job_id},
        user_id=user_id,
        project_id=project_id,
        idempotency_key=f"gmail_sync:{integration_id}:{sync_job_id}",
    )


def enqueue_data_folder_ingest(
    db: Session,
    *,
    file_path: str,
    user_id: Optional[int] = None,
    project_id: Optional[uuid.UUID] = None,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    embedding_api_key: Optional[str] = None,
) -> BackgroundJob:
    """Enqueue a DATA_FOLDER_INGEST job for a single file."""
    import hashlib as _hashlib
    file_hash = _hashlib.md5(file_path.encode()).hexdigest()[:12]
    return enqueue_job(
        db,
        job_type=BackgroundJobType.DATA_FOLDER_INGEST.value,
        payload={
            "file_path": file_path,
            "project_id": str(project_id) if project_id else None,
            "user_id": user_id,
            "embedding_provider": embedding_provider,
            "embedding_model": embedding_model,
            "embedding_api_key": embedding_api_key,
        },
        user_id=user_id,
        project_id=project_id,
        idempotency_key=f"df_ingest:{file_hash}",
    )


def reset_all_stale_running_jobs() -> int:
    """
    Called at startup to recover non-crawl jobs stuck in RUNNING after a crash.
    DOCUMENT_INGEST has its own handler (reset_stale_ingest_jobs); CRAWL has timeout cleanup.
    This covers PURGE_*, REINDEX, SEND_VERIFICATION_EMAIL, WEBHOOK_DELIVERY, and future types.
    Returns number of jobs reset.
    """
    excluded_types = {
        BackgroundJobType.CRAWL.value,
        BackgroundJobType.CRAWL_FETCH.value,
        BackgroundJobType.CRAWL_INGEST_BATCH.value,
        BackgroundJobType.DOCUMENT_INGEST.value,
    }
    stale_cutoff = _utcnow() - timedelta(minutes=int(settings.job_worker_stale_minutes))
    db = SessionLocal()
    try:
        stale = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                BackgroundJob.started_at < stale_cutoff,
                BackgroundJob.job_type.notin_(list(excluded_types)),
            )
            .all()
        )
        if not stale:
            return 0
        now = _utcnow()
        for job in stale:
            job.status = BackgroundJobStatus.PENDING.value
            job.started_at = None
            job.error = f"Reset: stale RUNNING job detected at {now.isoformat()}"
            logger.warning(
                "Stale %s job reset to PENDING: id=%s (was RUNNING since %s)",
                job.job_type,
                job.id,
                job.started_at,
            )
        db.commit()
        logger.info("Stale job recovery: reset %d job(s) to PENDING", len(stale))
        return len(stale)
    except Exception as exc:
        logger.error("Stale job recovery failed: %s", exc)
        return 0
    finally:
        db.close()


def _retry_after_for_attempt(attempt: int) -> datetime:
    base = max(1, int(settings.job_retry_base_delay_seconds))
    delay = min(2 ** (attempt - 1) * base, 3600)
    return _utcnow() + timedelta(seconds=delay)


def _maybe_finalize_reindex_run(db: Session, job: BackgroundJob) -> None:
    """After a REINDEX background job finishes, mark ReindexJob done when no work remains."""
    if job.job_type != BackgroundJobType.REINDEX.value:
        return
    payload = job.payload or {}
    project_id = payload.get("project_id")
    source = payload.get("source", "search")
    run_id = payload.get("run_id")
    if not project_id or not run_id:
        return
    from .reindex_service import maybe_finalize_after_batch

    maybe_finalize_after_batch(db, uuid.UUID(str(project_id)), str(source), str(run_id))


def process_pending_jobs(max_jobs: Optional[int] = None) -> int:
    limit = max_jobs or int(settings.job_worker_max_per_tick)
    db = SessionLocal()
    processed = 0
    try:
        jobs = _claim_next_jobs(db, limit)
        for job in jobs:
            try:
                _process_job_sync(job)
                _finish_job(db, job, status=BackgroundJobStatus.COMPLETED.value, result={"ok": True})
                _maybe_finalize_reindex_run(db, job)
                processed += 1
            except Exception as exc:
                logger.exception("Background job %s failed: %s", job.id, exc)
                try:
                    db.rollback()
                except Exception:
                    pass

                from .embed_rate_limit import (
                    EmbeddingRateLimitError,
                    is_embed_rate_limit_error,
                    rate_limit_job_retry_after,
                )
                from .crawl_ingest_helpers import fail_crawl_job_indexing, mark_crawl_indexing_wait
                from .indexing_job_types import INDEXING_JOB_TYPES

                is_crawl_ingest = job.job_type == BackgroundJobType.CRAWL_INGEST_BATCH.value
                is_indexing_job = job.job_type in INDEXING_JOB_TYPES
                is_rate_limit = is_embed_rate_limit_error(exc) or isinstance(
                    exc, EmbeddingRateLimitError
                )
                rate_limit_max = int(settings.crawl_ingest_rate_limit_max_attempts or 0)
                rate_limit_unlimited = rate_limit_max <= 0
                rate_limit_can_defer = is_rate_limit and is_indexing_job and (
                    rate_limit_unlimited or (job.attempts or 0) < rate_limit_max
                )

                if rate_limit_can_defer:
                    from .admission import release_active_counter

                    release_active_counter(job)
                    job.status = BackgroundJobStatus.PENDING.value
                    job.error = str(exc)[:2000]
                    job.retry_after = rate_limit_job_retry_after(
                        job.attempts or 1,
                        base_delay_seconds=int(settings.job_retry_base_delay_seconds),
                        cap_seconds=int(settings.embed_rate_limit_job_retry_cap_seconds),
                    )
                    payload = job.payload or {}
                    crawl_job_id = payload.get("crawl_job_id")
                    if crawl_job_id:
                        wait_db = SessionLocal()
                        try:
                            mark_crawl_indexing_wait(
                                wait_db,
                                crawl_job_id=uuid.UUID(str(crawl_job_id)),
                            )
                        finally:
                            wait_db.close()
                    elif job.job_type == BackgroundJobType.DOCUMENT_INGEST.value:
                        document_id = payload.get("document_id")
                        if document_id:
                            wait_db = SessionLocal()
                            try:
                                from ..models import UploadedDocument

                                doc = (
                                    wait_db.query(UploadedDocument)
                                    .filter(UploadedDocument.id == uuid.UUID(str(document_id)))
                                    .first()
                                )
                                if doc and doc.status not in ("Indexed", "Indexing Failed"):
                                    doc.status = "Indexing"
                                    wait_db.commit()
                            finally:
                                wait_db.close()
                    db.commit()
                    continue

                if (job.attempts or 0) >= (job.max_attempts or 3):
                    if is_crawl_ingest:
                        payload = job.payload or {}
                        crawl_job_id = payload.get("crawl_job_id")
                        source_id = payload.get("source_id")
                        if crawl_job_id and source_id:
                            fail_db = SessionLocal()
                            try:
                                fail_crawl_job_indexing(
                                    fail_db,
                                    crawl_job_id=uuid.UUID(str(crawl_job_id)),
                                    source_id=uuid.UUID(str(source_id)),
                                    raw_error=str(exc),
                                )
                            finally:
                                fail_db.close()
                    _finish_job(
                        db,
                        job,
                        status=BackgroundJobStatus.FAILED.value,
                        error=str(exc)[:2000],
                    )
                    _maybe_finalize_reindex_run(db, job)
                else:
                    from .admission import release_active_counter

                    release_active_counter(job)
                    job.status = BackgroundJobStatus.PENDING.value
                    job.error = str(exc)[:2000]
                    job.retry_after = _retry_after_for_attempt(job.attempts or 1)
                    db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        raise
    finally:
        db.close()
    return processed


def _worker_loop(thread_idx: int = 0) -> None:
    """
    Main poll loop for a single worker thread.
    thread_idx=0 sets the _worker_started event so lifespan can wait for at least one thread.
    Multiple threads each run their own loop; SKIP LOCKED in _claim_next_jobs ensures
    no two threads claim the same job row.
    """
    if thread_idx == 0:
        _worker_started.set()
    poll = max(0.5, float(settings.job_worker_poll_seconds))
    logger.info("Background job worker thread=%d started (poll=%.1fs)", thread_idx, poll)
    while True:
        try:
            backoff = _worker_db_backoff_remaining()
            if backoff > 0:
                threading.Event().wait(backoff)

            n = process_pending_jobs()
            _clear_db_unavailable()
            if n:
                logger.debug("Thread %d processed %s background job(s)", thread_idx, n)
            threading.Event().wait(poll)
        except Exception as exc:
            if _is_db_unavailable_error(exc):
                delay = _record_db_unavailable(exc, poll_seconds=poll)
                threading.Event().wait(delay)
            else:
                logger.error("Job worker thread=%d tick failed: %s", thread_idx, exc)
                threading.Event().wait(poll)


def worker_is_running() -> bool:
    """True when at least one background job worker thread is alive."""
    return any(t.is_alive() for t in _worker_threads)


def worker_thread_count() -> int:
    """Count of alive worker threads (for health endpoint)."""
    return sum(1 for t in _worker_threads if t.is_alive())


def wait_for_job_worker(timeout_sec: float = 30.0) -> bool:
    """Wait until at least one worker thread has started (lifespan startup)."""
    if worker_is_running():
        return True
    return _worker_started.wait(timeout=max(0.1, float(timeout_sec)))


def archive_old_jobs(retention_days: int = 30) -> int:
    """
    Move COMPLETED/FAILED background_jobs older than retention_days to job_archive.
    Returns number of rows archived.
    """
    from ..models import JobArchive

    cutoff = _utcnow() - timedelta(days=retention_days)
    db = SessionLocal()
    try:
        old_jobs = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.status.in_(
                    [
                        BackgroundJobStatus.COMPLETED.value,
                        BackgroundJobStatus.FAILED.value,
                    ]
                ),
                BackgroundJob.finished_at < cutoff,
            )
            .all()
        )
        if not old_jobs:
            return 0
        archived = 0
        for job in old_jobs:
            if not db.query(JobArchive).filter(JobArchive.id == job.id).first():
                db.add(
                    JobArchive(
                        id=job.id,
                        job_type=job.job_type,
                        status=job.status,
                        user_id=job.user_id,
                        project_id=job.project_id,
                        payload=job.payload,
                        result=job.result,
                        error=job.error,
                        attempts=job.attempts,
                        queued_at=job.queued_at,
                        started_at=job.started_at,
                        finished_at=job.finished_at,
                    )
                )
            db.delete(job)
            archived += 1
        db.commit()
        if archived:
            logger.info("Archived %d old background job(s) to job_archive", archived)
        return archived
    except Exception as exc:
        db.rollback()
        logger.error("Background job archival failed: %s", exc)
        return 0
    finally:
        db.close()


def start_job_worker() -> None:
    global _worker_threads
    if not settings.enable_durable_jobs:
        logger.info("Durable background jobs disabled (enable_durable_jobs=false)")
        _worker_started.set()
        return
    n_target = max(1, int(getattr(settings, "job_worker_threads", 2)))
    with _worker_lock:
        # Prune dead threads from the list before spawning new ones.
        _worker_threads = [t for t in _worker_threads if t.is_alive()]
        n_running = len(_worker_threads)
        if n_running >= n_target:
            _worker_started.set()
            return
        _worker_started.clear()
        for i in range(n_running, n_target):
            t = threading.Thread(
                target=_worker_loop,
                args=(i,),
                name=f"background-job-worker-{i}",
                daemon=True,
            )
            t.start()
            _worker_threads.append(t)
        logger.info(
            "Background job worker: started %d thread(s) (total=%d)",
            n_target - n_running,
            n_target,
        )


def _crawl_job_stale_minutes(job: Optional[CrawlJob] = None, pages_fetched: Optional[int] = None) -> int:
    """Effective stale timeout: max(base, pages * per_page) for large crawls."""
    base = int(settings.crawl_job_stale_minutes or 180)
    per_page = float(getattr(settings, "crawl_job_stale_minutes_per_page", 0.1) or 0.0)
    pages = pages_fetched
    if pages is None and job is not None:
        pages = int(getattr(job, "pages_fetched", 0) or 0)
    pages = int(pages or 0)
    proportional = int(pages * per_page) if per_page > 0 else 0
    return max(base, proportional)


def cleanup_stale_crawl_jobs() -> int:
    """Mark long-running crawl jobs as FAILED (mirrors Gmail stale job cleanup)."""
    base_minutes = int(settings.crawl_job_stale_minutes or 180)
    # Use base as the earliest candidate filter; per-job timeout may be higher.
    cutoff = _utcnow() - timedelta(minutes=base_minutes)
    db = SessionLocal()
    try:
        candidates = (
            db.query(CrawlJob)
            .filter(
                CrawlJob.status.in_(
                    [
                        CrawlJobStatus.PENDING,
                        CrawlJobStatus.RUNNING,
                        CrawlJobStatus.INDEXING,
                    ]
                ),
                CrawlJob.queued_at < cutoff,
            )
            .all()
        )
        if not candidates:
            return 0
        now = _utcnow()
        stale = []
        for job in candidates:
            minutes = _crawl_job_stale_minutes(job)
            job_cutoff = now - timedelta(minutes=minutes)
            queued_at = job.queued_at
            if queued_at is not None and queued_at.tzinfo is None:
                queued_at = queued_at.replace(tzinfo=timezone.utc)
            if queued_at is not None and queued_at < job_cutoff:
                stale.append((job, minutes))
        if not stale:
            return 0
        for job, minutes in stale:
            job.status = CrawlJobStatus.FAILED
            job.finished_at = now
            errs = list(job.errors or [])
            errs.append(
                {
                    "error": f"stale crawl job auto-failed after {minutes} minutes",
                    "timestamp": now.isoformat(),
                }
            )
            job.errors = errs
        db.commit()
        logger.warning("Auto-failed %s stale crawl job(s)", len(stale))
        return len(stale)
    finally:
        db.close()


def reset_running_crawl_jobs() -> int:
    """
    Reset RUNNING/INDEXING crawl jobs that are NOT yet stale back to PENDING on startup.
    Also resets ALL RUNNING crawl BackgroundJobs and syncs the Redis crawl:running counter.
    Stale CrawlJobs (older than effective crawl_job_stale_minutes) are left to cleanup_stale_crawl_jobs().
    """
    base_minutes = int(settings.crawl_job_stale_minutes or 180)
    cutoff = _utcnow() - timedelta(minutes=base_minutes)
    db = SessionLocal()
    try:
        recent_running = (
            db.query(CrawlJob)
            .filter(
                CrawlJob.status.in_([CrawlJobStatus.RUNNING, CrawlJobStatus.INDEXING]),
                CrawlJob.queued_at >= cutoff,
            )
            .all()
        )
        # Also keep large crawls that are past base but still within proportional budget.
        older_candidates = (
            db.query(CrawlJob)
            .filter(
                CrawlJob.status.in_([CrawlJobStatus.RUNNING, CrawlJobStatus.INDEXING]),
                CrawlJob.queued_at < cutoff,
            )
            .all()
        )
        now = _utcnow()
        for job in older_candidates:
            minutes = _crawl_job_stale_minutes(job)
            if minutes <= base_minutes:
                continue
            job_cutoff = now - timedelta(minutes=minutes)
            queued_at = job.queued_at
            if queued_at is not None and queued_at.tzinfo is None:
                queued_at = queued_at.replace(tzinfo=timezone.utc)
            if queued_at is not None and queued_at >= job_cutoff:
                recent_running.append(job)

        for job in recent_running:
            job.status = CrawlJobStatus.PENDING
            job.started_at = None

        # Reset ALL RUNNING crawl BackgroundJobs unconditionally — on startup nothing is
        # actually running. Filtering by crawl_job_ids misses cases where the CrawlJob
        # was already PENDING but the BackgroundJob was left RUNNING, which blocks the
        # crawl cap check indefinitely.
        # Also reset CRAWL_INGEST_BATCH: previously excluded, leaving INDEXING crawls
        # frozen at ~85% after a crash (batches never reclaimed).
        bg_jobs = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type.in_(
                    list(_CRAWL_FETCH_JOB_TYPES)
                    + [BackgroundJobType.CRAWL_INGEST_BATCH.value]
                ),
                BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
            )
            .all()
        )
        for bg in bg_jobs:
            bg.status = BackgroundJobStatus.PENDING.value
            bg.started_at = None

        db.commit()

        # Sync Redis crawl:running counter — stale counter blocks new crawls since
        # _claim_next_jobs skips CRAWL jobs when counter >= cap.
        try:
            from .admission import _redis
            r = _redis()
            if r:
                r.set("crawl:running", 0)
                logger.info("Startup: reset Redis crawl:running counter to 0")
        except Exception as exc:
            logger.warning("Startup: could not reset Redis crawl:running: %s", exc)

        total = len(recent_running)
        bg_reset = len(bg_jobs)
        if total or bg_reset:
            logger.info(
                "Crash recovery: reset %d CrawlJob(s) and %d BackgroundJob(s) to PENDING",
                total,
                bg_reset,
            )
        return total
    except Exception as exc:
        logger.error("reset_running_crawl_jobs failed: %s", exc)
        db.rollback()
        return 0
    finally:
        db.close()


def reset_stale_reindex_jobs() -> int:
    """
    Delete reindex_jobs rows stuck as 'running' after a crash.
    Reindex is always triggered manually so deleting is safe — user clicks again.
    """
    from ..models import ReindexJob

    db = SessionLocal()
    try:
        count = (
            db.query(ReindexJob)
            .filter(ReindexJob.status == "running")
            .delete(synchronize_session=False)
        )
        db.commit()
        if count:
            logger.info("Crash recovery: cleared %d stuck reindex job(s)", count)
        return count
    except Exception as exc:
        logger.error("reset_stale_reindex_jobs failed: %s", exc)
        db.rollback()
        return 0
    finally:
        db.close()


def count_pending_jobs_for_user(db: Session, user_id: int) -> int:
    """Return number of active (PENDING + RUNNING) document ingest jobs for a user.
    Used to enforce per-user queue depth caps before accepting new uploads."""
    return (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.user_id == user_id,
            BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
            BackgroundJob.status.in_(
                [BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]
            ),
        )
        .count()
    )


def reset_stale_ingest_jobs() -> int:
    """
    Called at startup to recover documents stuck in transitional states
    (Queued / Extracting / Indexing) after a server crash or unclean shutdown.

    Strategy:
    - BackgroundJobs in RUNNING → reset to PENDING (worker will re-claim and re-run).
    - UploadedDocuments stuck in a transitional status with no active job →
      mark as 'Indexing Failed' (staging file is gone; cannot re-run).

    Returns number of documents recovered.
    """
    db = SessionLocal()
    recovered = 0
    try:
        # 1. Reset RUNNING jobs back to PENDING so worker re-processes them.
        #    These are jobs the previous process claimed but never finished.
        running_jobs = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
            )
            .all()
        )
        for job in running_jobs:
            job.status = BackgroundJobStatus.PENDING.value
            job.started_at = None
            logger.warning(
                "Stale ingest job reset to PENDING: id=%s document_id=%s",
                job.id,
                job.payload.get("document_id") if job.payload else None,
            )
        if running_jobs:
            db.commit()
            logger.info("Reset %s stale RUNNING ingest job(s) to PENDING", len(running_jobs))

        # 2. Find documents stuck in transitional states with no active job.
        #    These are orphaned — their job was lost or never enqueued.
        stuck_docs = (
            db.query(UploadedDocument)
            .filter(UploadedDocument.status.in_(list(INGEST_TRANSITIONAL_STATUSES)))
            .all()
        )
        active_doc_ids: set[str] = {
            str(j.payload.get("document_id"))
            for j in db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                BackgroundJob.status.in_(
                    [BackgroundJobStatus.PENDING.value, BackgroundJobStatus.RUNNING.value]
                ),
            )
            .all()
            if j.payload and j.payload.get("document_id")
        }
        for doc in stuck_docs:
            if str(doc.id) not in active_doc_ids:
                raw = doc.text_content or b""
                if isinstance(raw, memoryview):
                    raw = raw.tobytes()
                has_bytes = bool(bytes(raw).strip())
                staging_path = None
                try:
                    from ..models import ConnectorDocument

                    link = (
                        db.query(ConnectorDocument)
                        .filter(ConnectorDocument.document_id == doc.id)
                        .first()
                    )
                    if link and link.staging_path and os.path.isfile(link.staging_path):
                        staging_path = link.staging_path
                except Exception:
                    staging_path = None

                if has_bytes or staging_path:
                    # Prefer re-queue over permanent failure when bytes still exist.
                    from ..paths import data_tmp_dir

                    if not staging_path and has_bytes:
                        # Rebuild a staging file for manual uploads / DB-only content.
                        safe = re.sub(r"[^\w.\-]", "_", (doc.title or "doc")[:80]) or "doc"
                        staging_path = str((data_tmp_dir() / f"{doc.id}_recover_{safe}").resolve())
                        try:
                            with open(staging_path, "wb") as fh:
                                fh.write(bytes(raw))
                        except Exception as write_exc:
                            logger.warning(
                                "Could not rebuild staging for %s: %s", doc.id, write_exc
                            )
                            staging_path = None

                    if staging_path and enqueue_document_ingest(
                        str(doc.id),
                        staging_path,
                        user_id=doc.user_id,
                        project_id=doc.project_id,
                    ):
                        doc.status = "Queued"
                        recovered += 1
                        logger.warning(
                            "Re-queued orphaned document ingest: id=%s title=%s",
                            doc.id,
                            doc.title,
                        )
                        continue

                logger.warning(
                    "Orphaned document stuck in '%s' with no active job — marking failed: id=%s title=%s",
                    doc.status,
                    doc.id,
                    doc.title,
                )
                doc.status = "Indexing Failed"
                recovered += 1
        if recovered:
            db.commit()
            logger.info("Recovered %s orphaned stuck document(s)", recovered)

        return recovered
    except Exception as exc:
        logger.error("reset_stale_ingest_jobs failed: %s", exc)
        return 0
    finally:
        db.close()


def reset_stale_crawl_ingest_batch_jobs() -> int:
    """Reset CRAWL_INGEST_BATCH jobs stuck in RUNNING longer than job_worker_stale_minutes.

    These jobs were previously excluded from all stale-reset paths, so a crashed or
    hung batch left the parent CrawlJob frozen at INDEXING (~85%) indefinitely.
    """
    cutoff = _utcnow() - timedelta(minutes=int(settings.job_worker_stale_minutes))
    db = SessionLocal()
    try:
        stale = (
            db.query(BackgroundJob)
            .filter(
                BackgroundJob.job_type == BackgroundJobType.CRAWL_INGEST_BATCH.value,
                BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                BackgroundJob.started_at < cutoff,
            )
            .all()
        )
        if not stale:
            return 0
        now = _utcnow()
        for job in stale:
            job.status = BackgroundJobStatus.PENDING.value
            job.started_at = None
            job.error = f"Reset: stale CRAWL_INGEST_BATCH at {now.isoformat()}"
            logger.warning(
                "Stale CRAWL_INGEST_BATCH reset to PENDING: id=%s",
                job.id,
            )
        db.commit()
        logger.info(
            "Stale CRAWL_INGEST_BATCH recovery: reset %d job(s) to PENDING",
            len(stale),
        )
        return len(stale)
    except Exception as exc:
        logger.error("reset_stale_crawl_ingest_batch_jobs failed: %s", exc)
        return 0
    finally:
        db.close()


def sweep_orphaned_indexing_crawl_jobs() -> int:
    """Finalize INDEXING CrawlJobs whose ingest batches are all already COMPLETED.

    Covers the case where every CRAWL_INGEST_BATCH bg-job finished but the CrawlJob
    never received the final record_crawl_ingest_batch_success signal.
    """
    from .crawl_ingest_helpers import maybe_finalize_crawl_indexing_if_batches_done

    db = SessionLocal()
    try:
        stuck = (
            db.query(CrawlJob)
            .filter(CrawlJob.status == CrawlJobStatus.INDEXING)
            .all()
        )
        fixed = 0
        for job in stuck:
            try:
                if maybe_finalize_crawl_indexing_if_batches_done(db, crawl_job_id=job.id):
                    fixed += 1
                    logger.info(
                        "sweep_orphaned: finalized CrawlJob %s (INDEXING → COMPLETED)",
                        job.id,
                    )
            except Exception as exc:
                logger.warning(
                    "sweep_orphaned: finalize failed for %s: %s",
                    job.id,
                    exc,
                )
        if fixed:
            logger.info("sweep_orphaned_indexing_crawl_jobs: finalized %d job(s)", fixed)
        return fixed
    except Exception as exc:
        logger.error("sweep_orphaned_indexing_crawl_jobs failed: %s", exc)
        return 0
    finally:
        db.close()
