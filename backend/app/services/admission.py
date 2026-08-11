"""
Redis-backed admission counters for job caps.
Falls back to DB COUNT when Redis is unavailable or enable_redis_admission is false.
Thread-safe: Redis INCR/DECR are atomic.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional, Union

logger = logging.getLogger(__name__)

_TTL_SECONDS = 3600 * 2  # 2h — leak-safe TTL; real jobs complete in <30 min


def _redis():
    try:
        from ..settings import settings

        if not getattr(settings, "enable_redis_admission", False):
            return None
        from .redis_client import get_redis

        return get_redis()
    except Exception:
        return None


def _project_key(project_id: Union[uuid.UUID, str]) -> str:
    return str(project_id)


# --- Crawl counters ---


def crawl_running_incr() -> None:
    r = _redis()
    if r:
        try:
            r.incr("crawl:running")
            r.expire("crawl:running", _TTL_SECONDS)
            return
        except Exception as e:
            logger.debug("admission crawl_running_incr redis error: %s", e)


def crawl_running_decr() -> None:
    r = _redis()
    if r:
        try:
            val = r.decr("crawl:running")
            if val < 0:
                r.set("crawl:running", 0)
        except Exception as e:
            logger.debug("admission crawl_running_decr redis error: %s", e)


def get_crawl_running(db=None) -> int:
    """Return running crawl count. Redis primary, DB fallback."""
    r = _redis()
    if r:
        try:
            val = r.get("crawl:running")
            if val is not None:
                return max(0, int(val))
        except Exception as e:
            logger.debug("admission get_crawl_running redis error: %s", e)
    if db is not None:
        try:
            from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType

            return (
                db.query(BackgroundJob)
                .filter(
                    BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                    BackgroundJob.job_type.in_(
                        [
                            BackgroundJobType.CRAWL.value,
                            BackgroundJobType.CRAWL_FETCH.value,
                        ]
                    ),
                )
                .count()
            )
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
    return 0


# --- Per-project ingest counters ---


def _ingest_active_key(project_id: Union[uuid.UUID, str]) -> str:
    return f"ingest:active:project:{_project_key(project_id)}"


def _ingest_queued_key(project_id: Union[uuid.UUID, str]) -> str:
    return f"ingest:queued:project:{_project_key(project_id)}"


def ingest_active_incr(project_id: Union[uuid.UUID, str]) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_active_key(project_id)
            r.incr(key)
            r.expire(key, _TTL_SECONDS)
        except Exception as e:
            logger.debug("admission ingest_active_incr redis error: %s", e)


def ingest_active_decr(project_id: Union[uuid.UUID, str]) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_active_key(project_id)
            val = r.decr(key)
            if val < 0:
                r.set(key, 0)
        except Exception as e:
            logger.debug("admission ingest_active_decr redis error: %s", e)


def ingest_queued_incr(project_id: Union[uuid.UUID, str]) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_queued_key(project_id)
            r.incr(key)
            r.expire(key, _TTL_SECONDS)
        except Exception as e:
            logger.debug("admission ingest_queued_incr redis error: %s", e)


def ingest_queued_decr(project_id: Union[uuid.UUID, str]) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_queued_key(project_id)
            val = r.decr(key)
            if val < 0:
                r.set(key, 0)
        except Exception as e:
            logger.debug("admission ingest_queued_decr redis error: %s", e)


def _db_ingest_active_count(db, project_id: Union[uuid.UUID, str]) -> int:
    from ..models import BackgroundJob, BackgroundJobStatus
    from .indexing_job_types import INDEXING_JOB_TYPES

    pid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
    return (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.project_id == pid,
            BackgroundJob.job_type.in_(INDEXING_JOB_TYPES),
            BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
        )
        .count()
    )


def get_ingest_active(project_id: Union[uuid.UUID, str], db=None) -> int:
    """Running indexing jobs for project (upload, crawl ingest, reindex)."""
    db_count: Optional[int] = None
    if db is not None:
        try:
            db_count = _db_ingest_active_count(db, project_id)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    r = _redis()
    if r:
        try:
            key = _ingest_active_key(project_id)
            val = r.get(key)
            if val is not None:
                redis_count = max(0, int(val))
                if db_count is not None and redis_count > db_count:
                    logger.warning(
                        "admission: heal ingest:active %s redis=%s db=%s",
                        project_id,
                        redis_count,
                        db_count,
                    )
                    r.set(key, db_count, ex=_TTL_SECONDS)
                    return db_count
                return redis_count
        except Exception as e:
            logger.debug("admission get_ingest_active redis error: %s", e)

    return db_count if db_count is not None else 0


def _db_ingest_queued_count(db, project_id: Union[uuid.UUID, str]) -> int:
    from ..models import BackgroundJob, BackgroundJobStatus
    from .indexing_job_types import INDEXING_JOB_TYPES

    pid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
    return (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.project_id == pid,
            BackgroundJob.job_type.in_(INDEXING_JOB_TYPES),
            BackgroundJob.status.in_(
                [
                    BackgroundJobStatus.PENDING.value,
                    BackgroundJobStatus.RUNNING.value,
                ]
            ),
        )
        .count()
    )


def get_ingest_queued(project_id: Union[uuid.UUID, str], db=None) -> int:
    """PENDING+RUNNING indexing jobs for project. Redis with DB reconciliation."""
    db_count: Optional[int] = None
    if db is not None:
        try:
            db_count = _db_ingest_queued_count(db, project_id)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    r = _redis()
    if r:
        try:
            key = _ingest_queued_key(project_id)
            val = r.get(key)
            if val is not None:
                redis_count = max(0, int(val))
                if db_count is not None and redis_count > db_count:
                    logger.warning(
                        "admission: heal ingest:queued %s redis=%s db=%s",
                        project_id,
                        redis_count,
                        db_count,
                    )
                    r.set(key, db_count, ex=_TTL_SECONDS)
                    return db_count
                return redis_count
        except Exception as e:
            logger.debug("admission get_ingest_queued redis error: %s", e)

    return db_count if db_count is not None else 0


def release_active_counter(job) -> None:
    """Decrement active admission counter when a claimed job leaves RUNNING without finishing."""
    from ..models import BackgroundJobType

    if job.job_type in (
        BackgroundJobType.CRAWL.value,
        BackgroundJobType.CRAWL_FETCH.value,
    ):
        crawl_running_decr()
    elif job.job_type == BackgroundJobType.DOCUMENT_INGEST.value and job.project_id:
        ingest_active_decr(job.project_id)
