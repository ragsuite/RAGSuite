"""
Lightweight in-process metrics for concurrency debugging (pool, Chroma lock, executors).
"""
from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

_lock = threading.Lock()
_metrics: Dict[str, Any] = {
    "chroma_write_lock_wait_seconds_total": 0.0,
    "chroma_write_lock_wait_count": 0,
    "chroma_write_lock_held_seconds_total": 0.0,
    "last_chroma_write_lock_wait_seconds": 0.0,
}


def record_chroma_lock_wait(wait_seconds: float) -> None:
    with _lock:
        _metrics["chroma_write_lock_wait_seconds_total"] += max(0.0, wait_seconds)
        _metrics["chroma_write_lock_wait_count"] += 1
        _metrics["last_chroma_write_lock_wait_seconds"] = wait_seconds


def record_chroma_lock_held(held_seconds: float) -> None:
    with _lock:
        _metrics["chroma_write_lock_held_seconds_total"] += max(0.0, held_seconds)


def snapshot_metrics() -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    with _lock:
        out.update(_metrics)

    try:
        from ..db import engine

        pool = engine.pool
        out["db_pool_size"] = pool.size()
        out["db_pool_checked_in"] = pool.checkedin()
        out["db_pool_checked_out"] = pool.checkedout()
        out["db_pool_overflow"] = pool.overflow()
    except Exception:
        pass

    try:
        from .ingest_runtime import ingest_pool_stats
        from .query_runtime import query_pool_stats

        out["ingest_pool"] = ingest_pool_stats()
        out["query_pool"] = query_pool_stats()
    except Exception:
        pass

    # Queue depth by job_type, oldest pending age, WAITING crawl stats
    try:
        from datetime import datetime, timedelta, timezone
        from sqlalchemy import func, text as sa_text
        from ..db import SessionLocal
        from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType, CrawlJob, CrawlJobStatus

        db = SessionLocal()
        try:
            now = datetime.now(timezone.utc)

            # Per-type PENDING and RUNNING counts + oldest pending age
            depth_rows = (
                db.query(
                    BackgroundJob.job_type,
                    BackgroundJob.status,
                    func.count().label("cnt"),
                    func.min(BackgroundJob.queued_at).label("oldest_queued_at"),
                )
                .filter(
                    BackgroundJob.status.in_([
                        BackgroundJobStatus.PENDING.value,
                        BackgroundJobStatus.RUNNING.value,
                    ])
                )
                .group_by(BackgroundJob.job_type, BackgroundJob.status)
                .all()
            )

            queue_depth: Dict[str, Any] = {}
            for row in depth_rows:
                key = f"{row.job_type}.{row.status.lower()}"
                queue_depth[key] = {"count": row.cnt}
                if row.oldest_queued_at is not None:
                    oldest = row.oldest_queued_at
                    if oldest.tzinfo is None:
                        oldest = oldest.replace(tzinfo=timezone.utc)
                    queue_depth[key]["oldest_age_seconds"] = round((now - oldest).total_seconds(), 1)
            out["queue_depth"] = queue_depth

            # WAITING crawl stats
            waiting_rows = (
                db.query(
                    func.count().label("cnt"),
                    func.min(CrawlJob.queued_at).label("oldest"),
                )
                .filter(CrawlJob.status == CrawlJobStatus.WAITING)
                .first()
            )
            waiting_count = waiting_rows.cnt if waiting_rows else 0
            waiting_oldest_age: Optional[float] = None
            if waiting_rows and waiting_rows.oldest is not None:
                oldest = waiting_rows.oldest
                if oldest.tzinfo is None:
                    oldest = oldest.replace(tzinfo=timezone.utc)
                waiting_oldest_age = round((now - oldest).total_seconds(), 1)
            out["crawl_waiting"] = {
                "count": waiting_count,
                "oldest_age_seconds": waiting_oldest_age,
            }

            # COMPLETED / FAILED counts in last 24h
            cutoff_24h = now - timedelta(hours=24)
            terminal_rows = (
                db.query(
                    BackgroundJob.status,
                    func.count().label("cnt"),
                )
                .filter(
                    BackgroundJob.status.in_([
                        BackgroundJobStatus.COMPLETED.value,
                        BackgroundJobStatus.FAILED.value,
                    ]),
                    BackgroundJob.finished_at >= cutoff_24h,
                )
                .group_by(BackgroundJob.status)
                .all()
            )
            terminal: Dict[str, int] = {r.status.lower(): r.cnt for r in terminal_rows}
            out["jobs_last_24h"] = {
                "completed": terminal.get("completed", 0),
                "failed": terminal.get("failed", 0),
            }

            # Row counts by status (retention / scan health)
            status_rows = (
                db.query(BackgroundJob.status, func.count().label("cnt"))
                .group_by(BackgroundJob.status)
                .all()
            )
            out["background_jobs_by_status"] = {r.status.lower(): r.cnt for r in status_rows}

            # Running CRAWL jobs vs configured cap
            from ..settings import settings as app_settings

            running_crawl = (
                db.query(BackgroundJob)
                .filter(
                    BackgroundJob.job_type == BackgroundJobType.CRAWL.value,
                    BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                )
                .count()
            )
            crawl_cap = max(1, int(app_settings.job_worker_crawl_threads))
            out["crawl_workers"] = {
                "running": running_crawl,
                "cap": crawl_cap,
                "cap_reached": running_crawl >= crawl_cap,
            }

            try:
                from .job_queue import worker_thread_count

                out["job_worker_threads_alive"] = worker_thread_count()
            except Exception:
                pass
        finally:
            db.close()
    except Exception:
        pass

    return out


class ChromaWriteLockTimer:
    """Context manager: record wait time entering and hold time exiting the write lock."""

    def __init__(self) -> None:
        self._wait_start: Optional[float] = None
        self._held_start: Optional[float] = None

    def mark_acquired(self) -> None:
        if self._wait_start is not None:
            record_chroma_lock_wait(time.time() - self._wait_start)
        self._held_start = time.time()

    def mark_released(self) -> None:
        if self._held_start is not None:
            record_chroma_lock_held(time.time() - self._held_start)
            self._held_start = None

    def __enter__(self) -> "ChromaWriteLockTimer":
        self._wait_start = time.time()
        return self

    def __exit__(self, *args: Any) -> None:
        self.mark_released()
