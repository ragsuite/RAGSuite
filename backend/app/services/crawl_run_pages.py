"""Page lists ("Pages read") for crawl runs that only trained saved pages.

Some existing runs indexed already saved pages without running the crawler, so they have
no crawler ``crawl_diagnostics``. Their page list is rebuilt from their ingest batch
payloads (live queue or retention archive); stored job data is never modified.
"""
from __future__ import annotations

import threading
import uuid
from collections import OrderedDict
from typing import Any, Iterable, List, Sequence

from sqlalchemy.orm import Session

from ..models import BackgroundJob, BackgroundJobType, CrawlJob, CrawlJobStatus, Document, JobArchive
from .crawl_status_urls import find_crawl_diagnostics

_ID_CHUNK = 1000
# Rebuilt lists of finished runs never change; paging and search reuse them.
_FINISHED = {CrawlJobStatus.COMPLETED, CrawlJobStatus.FAILED, CrawlJobStatus.CANCELLED}
_REBUILT_MAX = 16
_rebuilt: "OrderedDict[str, dict]" = OrderedDict()
_rebuilt_lock = threading.Lock()


def index_run_diagnostics(page_urls: Sequence[str]) -> dict:
    """``crawl_diagnostics`` entry for a run that trains already saved pages."""
    return {
        "type": "crawl_diagnostics",
        "crawled_urls_total": len(page_urls),
        "crawled_urls": [{"url": url} for url in page_urls],
        "skipped_urls": [],
        "failed_urls": [],
        "skipped_count": 0,
        "failed_count": 0,
    }


def page_urls_for_documents(db: Session, document_ids: Sequence[str]) -> List[str]:
    """URLs of saved pages, in ``document_ids`` order (unknown ids are dropped)."""
    ids = [uuid.UUID(str(doc_id)) for doc_id in document_ids]
    url_by_id: dict = {}
    for start in range(0, len(ids), _ID_CHUNK):
        chunk = ids[start : start + _ID_CHUNK]
        for doc_id, url in db.query(Document.id, Document.url).filter(Document.id.in_(chunk)).all():
            if url:
                url_by_id[doc_id] = url
    return [url_by_id[doc_id] for doc_id in ids if doc_id in url_by_id]


def _is_index_only_run(errors: Any) -> bool:
    """Crawler runs write ``crawl_diagnostics`` before indexing; index-only runs never do."""
    return isinstance(errors, list) and any(
        isinstance(entry, dict) and entry.get("type") == "indexing_progress" for entry in errors
    )


def _ingested_document_ids(db: Session, crawl_job_id: uuid.UUID) -> List[str]:
    key = str(crawl_job_id)
    payloads: List[Any] = []
    for model in (BackgroundJob, JobArchive):
        payloads.extend(
            payload
            for (payload,) in db.query(model.payload)
            .filter(
                model.job_type == BackgroundJobType.CRAWL_INGEST_BATCH.value,
                model.payload["crawl_job_id"].as_string() == key,
            )
            .all()
        )
    payloads.sort(key=lambda p: int((p or {}).get("batch_index") or 0))
    return list(dict.fromkeys(_document_ids(payloads)))


def _document_ids(payloads: Iterable[Any]) -> Iterable[str]:
    for payload in payloads:
        for doc_id in (payload or {}).get("document_ids") or []:
            yield str(doc_id)


def run_url_diagnostics(db: Session, job: CrawlJob) -> dict:
    """The run's stored ``crawl_diagnostics``; for older index-only runs, rebuilt from its batches."""
    stored = find_crawl_diagnostics(job.errors)
    if stored or not _is_index_only_run(job.errors):
        return stored
    key = str(job.id)
    with _rebuilt_lock:
        if key in _rebuilt:
            _rebuilt.move_to_end(key)
            return _rebuilt[key]
    urls = page_urls_for_documents(db, _ingested_document_ids(db, job.id))
    diagnostics = index_run_diagnostics(urls) if urls else {}
    if getattr(job, "status", None) in _FINISHED:
        with _rebuilt_lock:
            _rebuilt[key] = diagnostics
            while len(_rebuilt) > _REBUILT_MAX:
                _rebuilt.popitem(last=False)
    return diagnostics
