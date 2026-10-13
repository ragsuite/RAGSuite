"""``CATALOG_EXTRACT`` job: build records for pages indexed before extraction existed (or
by an older extractor), then let the model fill verified gaps.

Scheduling is automatic: the first item question of a project (per process) queues one
job per crawl source whose records are missing for the current ``EXTRACTOR_VERSION``.
New crawls never need it — ``crawler`` refreshes records on every ingest.
"""
from __future__ import annotations

import logging
import threading
import uuid
from typing import Optional, Set

from sqlalchemy.orm import Session

from .extract import EXTRACTOR_VERSION

logger = logging.getLogger(__name__)

BATCH = 200
_checked: Set[str] = set()
_checked_lock = threading.Lock()


def job_key(source_id: str) -> str:
    return f"catalog_extract:{source_id}:v{EXTRACTOR_VERSION}"


def _needs_job(db: Session, source_id: str) -> bool:
    from ...models import BackgroundJob, BackgroundJobStatus

    job = db.query(BackgroundJob).filter(BackgroundJob.idempotency_key == job_key(source_id)).first()
    return job is None or job.status in (BackgroundJobStatus.FAILED.value, BackgroundJobStatus.CANCELLED.value)


def ensure_scheduled(db: Session, project_id: str) -> int:
    """Queue missing backfills for the project's crawl sources (checked once per process)."""
    key = str(project_id)
    with _checked_lock:
        if key in _checked:
            return 0
        _checked.add(key)
    from ...models import BackgroundJobType, CrawlSource, Document
    from ...settings import settings
    from ..job_queue import enqueue_job

    queued = 0
    try:
        sources = db.query(CrawlSource).filter(CrawlSource.project_id == uuid.UUID(key)).all()
        for source in sources:
            sid = str(source.id)
            if not _needs_job(db, sid):
                continue
            if db.query(Document.id).filter(Document.source_id == source.id).first() is None:
                continue
            payload = {"project_id": key, "source_id": sid, "version": EXTRACTOR_VERSION}
            if settings.enable_durable_jobs:
                enqueue_job(
                    db, job_type=BackgroundJobType.CATALOG_EXTRACT.value, payload=payload,
                    user_id=source.created_by_id, project_id=uuid.UUID(key), idempotency_key=job_key(sid),
                )
            else:
                threading.Thread(target=process_payload, args=(payload,), daemon=True).start()
            queued += 1
    except Exception as exc:
        db.rollback()
        logger.warning("catalog backfill scheduling failed project=%s: %s", key, exc)
        with _checked_lock:
            _checked.discard(key)
    return queued


def _model_fill(db: Session, project_id: str, source_id: str) -> int:
    from ...models import CatalogItem, Document
    from ..rag.llm_chunk_context_job import _chat_completer
    from . import llm_extract
    from .store import apply_model_fill

    limit = llm_extract.max_calls_per_job()
    if limit <= 0:
        return 0
    rows = (
        db.query(CatalogItem)
        .filter(CatalogItem.source_id == source_id, CatalogItem.method == "text")
        .filter((CatalogItem.price.is_(None)) | (CatalogItem.brand.is_(None)) | (CatalogItem.category.is_(None)))
        .limit(limit)
        .all()
    )
    if not rows:
        return 0
    complete = _chat_completer(db, project_id)
    if complete is None:
        return 0
    filled = 0
    for row in rows:
        doc = db.get(Document, row.document_id)
        if doc is None:
            continue
        fields = llm_extract.fill(doc.title or "", doc.text_content or "", complete)
        if fields and apply_model_fill(db, str(row.document_id), fields):
            filled += 1
        db.commit()
    return filled


def process_payload(payload: dict) -> dict:
    from ...db import SessionLocal
    from ...models import Document
    from .index import invalidate
    from .store import refresh_documents

    project_id = str(payload.get("project_id") or "")
    source_id = str(payload.get("source_id") or "")
    if not (project_id and source_id):
        raise ValueError("catalog_extract missing project_id or source_id")
    db = SessionLocal()
    totals = {"upserted": 0, "deleted": 0, "skipped": 0, "model_filled": 0}
    try:
        last_id: Optional[uuid.UUID] = None
        while True:
            q = db.query(Document).filter(Document.source_id == uuid.UUID(source_id))
            if last_id is not None:
                q = q.filter(Document.id > last_id)
            batch = q.order_by(Document.id).limit(BATCH).all()
            if not batch:
                break
            stats = refresh_documents(db, batch, project_id=project_id, source_id=source_id)
            for k, v in stats.items():
                totals[k] += v
            last_id = batch[-1].id
            db.expunge_all()
        totals["model_filled"] = _model_fill(db, project_id, source_id)
    finally:
        db.close()
    invalidate(project_id)
    logger.info("catalog backfill source=%s: %s", source_id, totals)
    return totals
