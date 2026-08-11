# Sprint 3 Implementation Brief

> **Load this file at the start of a new session and execute without needing any other context.**
> Branch: `server`. Never push to GitLab remote — local commits only.
> Run `alembic upgrade head` after migrations before testing.

---

## Goal

Split the monolithic `run_crawl()` function into two separate durable job types:

```
CRAWL_FETCH  →  pages saved to DB (Document rows)
               →  enqueue CRAWL_INGEST_BATCH jobs (N docs per batch)
CRAWL_INGEST_BATCH  →  embed + write to Chroma (via locked_write_prepared_ingest)
```

**Why:** Today one CRAWL job holds a worker thread for hours (fetch + embed together). After split, fetch worker finishes fast, ingest workers handle embedding in parallel under the fair queue + per-project caps already in place (Sprints 1–2).

Also add:
- Standalone worker entrypoint (`python -m app.worker`)
- Scheduler as a separate process guard (leader lock already exists via Redis)

---

## Current state (what exists)

### `run_crawl(job_id, source_id)` in `crawler.py:381`
Does EVERYTHING in one async function:
1. Validates URL (lines 435–443)
2. Sets job RUNNING, resets `trained_at` (lines 447–456)
3. Calls `_run_scrapy_spider(...)` — actual HTTP fetch, saves `Document` rows to DB (lines 516–530)
4. Sets job status to INDEXING (line 541)
5. Calls `_direct_ingest_crawl_documents(source_id)` via `run_ingest_async` — embeds into Chroma (lines 591–613)
6. Sets job COMPLETED/FAILED (lines 624–644)
7. Creates notifications (lines 646–672)
8. Promotes WAITING crawls (lines 680–685)

### `_direct_ingest_crawl_documents(source_id)` in `crawler.py:2219`
Standalone function (already has its own DB session):
- Loads all `Document` rows for `source_id`
- Calls `locked_write_prepared_ingest(texts, chunk_metadata, ...)` with embedding resolution
- Handles batch + pause settings
- Returns `{"status": "Indexed", "chunks": N}`

### `_process_crawl(payload)` in `job_queue.py` (current handler)
```python
async def _process_crawl(payload: dict) -> None:
    crawl_job_id = uuid.UUID(str(payload["crawl_job_id"]))
    source_id = uuid.UUID(str(payload["source_id"]))
    await run_crawl(crawl_job_id, source_id)
```
Just calls the monolithic `run_crawl`.

### `BackgroundJobType` enum in `models.py` (current values)
```python
CRAWL = "CRAWL"
DOCUMENT_INGEST = "DOCUMENT_INGEST"
PURGE_CRAWL_SOURCE = "PURGE_CRAWL_SOURCE"
PURGE_UPLOADED_DOCUMENT = "PURGE_UPLOADED_DOCUMENT"
REINDEX = "REINDEX"
SEND_VERIFICATION_EMAIL = "SEND_VERIFICATION_EMAIL"
WEBHOOK_DELIVERY = "WEBHOOK_DELIVERY"
DATA_FOLDER_INGEST = "DATA_FOLDER_INGEST"
GMAIL_SYNC = "GMAIL_SYNC"
```

### Alembic state
Current head: `i2j3k4l5m6n7` (Sprint 2 migration).

---

## Implementation order

### Step 1 — `models.py`: add two new job types

Add to `BackgroundJobType` enum:
```python
CRAWL_FETCH = "CRAWL_FETCH"
CRAWL_INGEST_BATCH = "CRAWL_INGEST_BATCH"
```

Keep `CRAWL = "CRAWL"` — existing queued CRAWL jobs must still work during rollout.

---

### Step 2 — `settings.py`: add one new setting

After `reindex_batch_size`:
```python
# Docs per CRAWL_INGEST_BATCH job (0 = all at once, same as legacy).
crawl_ingest_batch_size_jobs: int = 50
```

Note: `crawl_ingest_batch_size` already exists (for the old inline batch pause). The new setting `crawl_ingest_batch_size_jobs` controls how many Document rows go into each CRAWL_INGEST_BATCH background job.

---

### Step 3 — `crawler.py`: split `run_crawl` into fetch-only + enqueue

#### 3a. New function `run_crawl_fetch(job_id, source_id)` (replaces the monolithic `run_crawl`)

This is `run_crawl` with ONLY steps 1–4 (validate, set RUNNING, spider, set INDEXING).
After the spider completes and Documents are saved, instead of calling `_direct_ingest_crawl_documents`, it enqueues `CRAWL_INGEST_BATCH` jobs and returns.

Pseudocode structure:
```python
async def run_crawl_fetch(job_id: uuid.UUID, source_id: uuid.UUID) -> None:
    # --- identical to current run_crawl lines 397–530 ---
    # (open db, validate URL, set RUNNING, copy scalars, close db, run spider)
    
    db = SessionLocal()
    try:
        job = ...  # reload after spider
        source = ...
        job.status = CrawlJobStatus.INDEXING
        job.pages_fetched = documents_saved
        source.last_crawl_at = finished_time
        source.documents_count = documents_saved
        db.commit()

        _auto_add_crawled_domains_to_allowed_list(source, crawled_urls, db)

        # NEW: enqueue ingest batches instead of inlining
        _enqueue_crawl_ingest_batches(db, source_id, job_id, user_id=source.created_by_id)
        
        # Do NOT set COMPLETED here — the last CRAWL_INGEST_BATCH job does that.
    finally:
        db.close()
    _clear_cancel_flag(str(source_id))
```

#### 3b. New helper `_enqueue_crawl_ingest_batches(db, source_id, job_id, user_id)`

```python
def _enqueue_crawl_ingest_batches(db, source_id, crawl_job_id, user_id=None):
    from .job_queue import enqueue_job
    from ..settings import settings
    from ..models import Document, BackgroundJobType

    doc_ids = [
        str(d.id)
        for d in db.query(Document.id).filter(Document.source_id == source_id).all()
    ]
    if not doc_ids:
        # No documents — mark crawl job failed immediately
        from ..models import CrawlJob, CrawlJobStatus
        job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
        if job:
            job.status = CrawlJobStatus.FAILED
            job.finished_at = datetime.now(timezone.utc)
            job.errors = [{"error": "No documents saved during fetch", "timestamp": datetime.now(timezone.utc).isoformat()}]
            db.commit()
        return

    batch_size = max(1, int(settings.crawl_ingest_batch_size_jobs))
    batches = [doc_ids[i:i+batch_size] for i in range(0, len(doc_ids), batch_size)]
    
    for idx, batch in enumerate(batches):
        is_last = (idx == len(batches) - 1)
        enqueue_job(
            db,
            job_type=BackgroundJobType.CRAWL_INGEST_BATCH.value,
            payload={
                "source_id": str(source_id),
                "crawl_job_id": str(crawl_job_id),
                "document_ids": batch,
                "batch_index": idx,
                "total_batches": len(batches),
                "is_last_batch": is_last,
                "user_id": user_id,
            },
            user_id=user_id,
            idempotency_key=f"crawl_ingest:{crawl_job_id}:batch{idx}",
        )
```

#### 3c. Keep `run_crawl` as a compatibility shim

```python
async def run_crawl(job_id: uuid.UUID, source_id: uuid.UUID) -> None:
    """Legacy shim — routes to run_crawl_fetch for new-style split execution."""
    await run_crawl_fetch(job_id, source_id)
```

This means existing `CRAWL` job handler in `job_queue.py` keeps working unchanged.

---

### Step 4 — `job_queue.py`: add CRAWL_INGEST_BATCH handler

#### 4a. New handler `_process_crawl_ingest_batch(payload)`

```python
def _process_crawl_ingest_batch(payload: dict) -> None:
    from .crawler import _direct_ingest_crawl_documents
    from ..models import CrawlJob, CrawlJobStatus, Document
    import uuid as _uuid

    source_id = _uuid.UUID(str(payload["source_id"]))
    crawl_job_id = _uuid.UUID(str(payload["crawl_job_id"]))
    document_ids: list[str] = payload.get("document_ids") or []
    is_last = bool(payload.get("is_last_batch", True))
    user_id = payload.get("user_id")

    if not document_ids:
        return

    # Run ingest for only this batch of document_ids.
    # _direct_ingest_crawl_documents loads ALL docs for source — we need a filtered variant.
    # Use _direct_ingest_crawl_documents_subset defined below.
    result = _direct_ingest_crawl_documents_subset(source_id, document_ids)
    chunks = int(result.get("chunks", 0) or 0)
    indexing_error = None if chunks > 0 else result.get("status", "No chunks")

    if is_last:
        # Last batch: finalize CrawlJob status, create notification, promote waiting.
        db = SessionLocal()
        try:
            job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
            source = None
            if job:
                from ..models import CrawlSource
                source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()

            now = _utcnow()
            if job:
                if indexing_error and chunks == 0:
                    job.status = CrawlJobStatus.FAILED
                    errs = list(job.errors or [])
                    errs.append({"error": f"Ingest batch failed: {indexing_error}", "timestamp": now.isoformat()})
                    job.errors = errs
                else:
                    job.status = CrawlJobStatus.COMPLETED
                    if source:
                        source.trained_at = now
                job.finished_at = now
                db.commit()

            if job and source:
                from .notification_service import create_notification
                from .concurrency_limits import promote_all_waiting_for_user
                try:
                    if job.status == CrawlJobStatus.COMPLETED:
                        create_notification(db=db, user_id=source.created_by_id,
                            title="Crawl Job Completed",
                            message=f"Crawled and indexed {job.pages_fetched or 0} pages from {source.base_url}",
                            type="success", action_url="/crawl")
                    else:
                        create_notification(db=db, user_id=source.created_by_id,
                            title="Crawl Job Failed",
                            message=f"Crawl for {source.base_url} failed during indexing.",
                            type="error", action_url="/crawl")
                except Exception as e:
                    logger.warning("crawl_ingest_batch: notification failed: %s", e)
                try:
                    if source.created_by_id:
                        promote_all_waiting_for_user(db, source.created_by_id)
                except Exception as e:
                    logger.warning("crawl_ingest_batch: promote waiting failed: %s", e)
        finally:
            db.close()
```

#### 4b. New helper `_direct_ingest_crawl_documents_subset(source_id, document_ids)`

Add to `crawler.py` (next to `_direct_ingest_crawl_documents`):

```python
def _direct_ingest_crawl_documents_subset(
    source_id: uuid.UUID, document_ids: list[str]
) -> Dict[str, object]:
    """Like _direct_ingest_crawl_documents but only processes specified document_ids."""
    from .rag.singleton import locked_write_prepared_ingest
    from .rag.embedding_resolver import resolve_for_project as _resolve_emb_for_project

    db = SessionLocal()
    try:
        source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
        if not source:
            return {"status": "Source not found", "chunks": 0}

        doc_uuids = [uuid.UUID(d) for d in document_ids]
        documents = db.query(Document).filter(
            Document.source_id == source_id,
            Document.id.in_(doc_uuids),
        ).all()

        texts, chunk_metadata = [], []
        for doc in documents:
            text = (doc.text_content or "").strip()
            if not text:
                continue
            texts.append(text)
            chunk_metadata.append({
                "url": doc.url,
                "title": doc.title or "",
                "source_type": "crawl",
                "crawled_at": (doc.meta_data or {}).get("crawled_at"),
            })

        if not texts:
            return {"status": "No text extracted", "chunks": 0}

        try:
            emb_provider, emb_model, emb_api_key = _resolve_emb_for_project(
                db, source.project_id, source="search"
            )
        except Exception:
            emb_provider, emb_model, emb_api_key = None, None, None

        return locked_write_prepared_ingest(
            texts=texts,
            chunk_metadata=chunk_metadata,
            source_file=f"crawl_source_{source.id}",
            document_id=str(source.id),
            user_id=source.created_by_id,
            project_id=str(source.project_id),
            embedding_provider=emb_provider,
            embedding_model=emb_model,
            embedding_api_key=emb_api_key,
        )
    finally:
        db.close()
```

#### 4c. Wire CRAWL_INGEST_BATCH into `_process_job_sync` dispatch

In the `elif` chain in `_process_job_sync`, add:
```python
elif jtype == BackgroundJobType.CRAWL_INGEST_BATCH.value:
    _process_crawl_ingest_batch(payload)
elif jtype == BackgroundJobType.CRAWL_FETCH.value:
    asyncio.run(_process_crawl_fetch(payload))
```

Add `_process_crawl_fetch`:
```python
async def _process_crawl_fetch(payload: dict) -> None:
    from .crawler import run_crawl_fetch
    crawl_job_id = uuid.UUID(str(payload["crawl_job_id"]))
    source_id = uuid.UUID(str(payload["source_id"]))
    await run_crawl_fetch(crawl_job_id, source_id)
```

---

### Step 5 — `crawl.py` (route): update `enqueue_crawl` call to use `CRAWL_FETCH`

Find where `enqueue_crawl()` is called in `routes/crawl.py` and/or `job_queue.py`.

In `job_queue.py`, update `enqueue_crawl()`:
```python
def enqueue_crawl(crawl_job_id: str, source_id: str, user_id: Optional[int] = None) -> bool:
    if not settings.enable_durable_jobs:
        return False
    db = SessionLocal()
    try:
        enqueue_job(
            db,
            job_type=BackgroundJobType.CRAWL_FETCH.value,  # CHANGED from CRAWL
            payload={"crawl_job_id": crawl_job_id, "source_id": source_id},
            user_id=user_id,
            idempotency_key=f"crawl:{crawl_job_id}",
        )
        return True
    finally:
        db.close()
```

Keep `BackgroundJobType.CRAWL` handler in `_process_job_sync` for backward compat (any CRAWL rows already in DB).

---

### Step 6 — Alembic migration

File: `backend/alembic/versions/j3k4l5m6n7o8_sprint3_crawl_split.py`

```python
"""Sprint 3: no schema changes needed (new job types are string values, not DB columns)

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-05-27
"""
from alembic import op

revision = "j3k4l5m6n7o8"
down_revision = "i2j3k4l5m6n7"
branch_labels = None
depends_on = None

def upgrade() -> None:
    # No schema changes — CRAWL_FETCH and CRAWL_INGEST_BATCH are string values
    # stored in the existing job_type VARCHAR(64) column.
    pass

def downgrade() -> None:
    pass
```

---

### Step 7 — Standalone worker entrypoint

Create `backend/app/worker.py`:

```python
"""
Standalone background job worker process.

Usage:
    python -m app.worker
    # or via supervisor:
    # command=python -m app.worker
"""
import logging
import os
import signal
import sys
import threading
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("app.worker")


def _setup_db():
    from .db import engine  # noqa — ensures DB is connected
    logger.info("Database connection established")


def _handle_signal(signum, frame):
    logger.info("Worker received signal %s — shutting down", signum)
    sys.exit(0)


def main():
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    logger.info("RAGSuite background worker starting")
    _setup_db()

    from .services.job_queue import start_job_worker, wait_for_job_worker
    start_job_worker()
    if not wait_for_job_worker(timeout_sec=30.0):
        logger.error("Worker threads failed to start within 30s — exiting")
        sys.exit(1)

    logger.info("Worker threads running. Ctrl+C or SIGTERM to stop.")
    try:
        while True:
            time.sleep(5)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Worker stopped")


if __name__ == "__main__":
    # Allow: python -m app.worker
    main()
```

---

### Step 8 — `settings.py`: `.env.example` update

Add to `.env.example` under the Sprint 2 block:
```
# --- Sprint 3: Crawl fetch/ingest split ---
# Documents per CRAWL_INGEST_BATCH background job (0 = all at once).
# CRAWL_INGEST_BATCH_SIZE_JOBS=50
```

---

## Files to change (summary)

| File | What changes |
|------|-------------|
| `backend/app/models.py` | Add `CRAWL_FETCH`, `CRAWL_INGEST_BATCH` to `BackgroundJobType` |
| `backend/app/settings.py` | Add `crawl_ingest_batch_size_jobs: int = 50` |
| `backend/app/services/crawler.py` | Add `run_crawl_fetch`, `_enqueue_crawl_ingest_batches`, `_direct_ingest_crawl_documents_subset`; keep `run_crawl` as shim |
| `backend/app/services/job_queue.py` | Add `_process_crawl_ingest_batch`, `_process_crawl_fetch`; update `_process_job_sync`; update `enqueue_crawl` to use `CRAWL_FETCH` |
| `backend/app/worker.py` | NEW — standalone worker entrypoint |
| `backend/alembic/versions/j3k4l5m6n7o8_sprint3_crawl_split.py` | NEW — empty migration (no schema changes) |
| `backend/.env.example` | Document new setting |

---

## Implementation constraints

1. **Do NOT remove `BackgroundJobType.CRAWL` or its handler** — backward compat for any rows already in DB
2. **`run_crawl()` must stay** (as a shim) — called by existing CRAWL job handler
3. **`_direct_ingest_crawl_documents()` must stay** — called by legacy inline path
4. **CRAWL_INGEST_BATCH job sets `CrawlJob.status = COMPLETED`** only on `is_last_batch=True`
5. **Do not change `_run_scrapy_spider`** — it's 1000+ lines, untouched
6. Commit locally only — never push to GitLab remote (`git push` is forbidden)
7. Run `alembic upgrade head` before testing

---

## How to test after implementation

1. Set `ENABLE_DURABLE_JOBS=true` in `backend/.env`
2. Trigger a crawl via the UI
3. Check `background_jobs` table:
   - One `CRAWL_FETCH` row goes RUNNING → COMPLETED
   - Multiple `CRAWL_INGEST_BATCH` rows appear and go RUNNING → COMPLETED
   - `CrawlJob` row transitions: PENDING → RUNNING → INDEXING → COMPLETED
4. Verify Chroma has vectors: query the project via chat/search
5. Run `python -m app.worker` standalone — confirm it starts and polls
