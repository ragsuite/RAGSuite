# RAGSuite — Ingest Performance Plan

Phase 1 is **implemented** (ingest thread pool, `INDEXING` crawl status, wired entry points).  
This document covers **Phase 2** and **Phase 3** only.

---

## Phase 2 — Concurrency & fairness (optional)

**When to do it:** Multiple users or many simultaneous crawls/ingests still overload CPU, Ollama, or the DB — after Phase 1 + env tuning is not enough.

**Goal:** Prevent one tenant or one huge job from starving others. **Defaults stay unlimited** until you set env vars.

### What to build

| Item | Description |
|------|-------------|
| **Crawl start cap** | If `MAX_CONCURRENT_CRAWL_JOBS > 0`, limit active `asyncio` crawl tasks; return **429** when at cap (simple; no queue schema). |
| **Ingest cap** | If `MAX_CONCURRENT_INGEST_JOBS > 0`, semaphore in `ingest_runtime` before submitting to the thread pool. |
| **Per-project cap** | Optional `MAX_CONCURRENT_INGEST_PER_PROJECT` for fair multi-tenant behavior. |
| **Crawl ingest batching** | Already partially in Phase 1 via `CRAWL_INGEST_BATCH_SIZE` + `INGEST_BATCH_PAUSE_MS`. Phase 2 can add progress on `CrawlJob` if batching is enabled. |
| **Chroma lock (gated)** | Only if `CHROMA_MODE=http` **and** `CHROMA_PER_COLLECTION_LOCK=true`: per-collection locks instead of global `_ingest_lock`. Keep global lock for local `PersistentClient`. |

### Configuration (all opt-in)

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_CONCURRENT_CRAWL_JOBS` | `0` | `0` = unlimited (today) |
| `MAX_CONCURRENT_INGEST_JOBS` | `0` | Global ingest cap |
| `MAX_CONCURRENT_INGEST_PER_PROJECT` | `0` | Per-project ingest cap |
| `CRAWL_INGEST_BATCH_SIZE` | `0` | Pages per embed batch (`0` = one shot) |
| `INGEST_BATCH_PAUSE_MS` | `0` | Pause between batches for Ollama/chat |
| `CHROMA_PER_COLLECTION_LOCK` | `false` | Only with `CHROMA_MODE=http` |

### Files to touch

- [`backend/app/routes/crawl.py`](backend/app/routes/crawl.py) — crawl semaphore / 429
- [`backend/app/services/ingest_runtime.py`](backend/app/services/ingest_runtime.py) — ingest semaphore
- [`backend/app/services/crawler.py`](backend/app/services/crawler.py) — batch progress (optional column + migration)
- [`backend/app/services/rag/singleton.py`](backend/app/services/rag/singleton.py) — per-collection lock (gated)
- [`backend/app/settings.py`](backend/app/settings.py), [`backend/.env.example`](backend/.env.example)

### Success criteria

- 3 concurrent crawls + steady chat: chat p95 within your SLO
- With all `MAX_*=0`, behavior matches Phase 1 (regression)

### Rollback

Set all `MAX_*` to `0`; disable `CHROMA_PER_COLLECTION_LOCK`.

---

## Phase 3 — Queue + worker (optional scale-out)

**When to do it:** Single API + Phase 2 limits are not enough; you need durable jobs, horizontal scale of ingest, or API/worker isolation in production.

**Goal:** API never runs heavy embed/index; workers scale independently. **Single-process deploy remains supported** via `INGEST_MODE=inline`.

### What to build

| Item | Description |
|------|-------------|
| **`ingest_jobs` table** | Alembic migration: `id`, `type`, `project_id`, `user_id`, `payload` (JSON), `status`, `progress`, `error`, timestamps; optional FK to `crawl_jobs.id`. |
| **Redis queue** | Use existing `redis` dependency (e.g. ARQ or RQ). |
| **Worker entrypoint** | `backend/app/worker.py` + `backend/app/jobs/handlers.py` — handlers call `ingest_runtime` → existing `locked_*` paths. |
| **API routing** | If `INGEST_MODE=queue`: enqueue and return job id; else Phase 1 `run_ingest_async` / `run_ingest_sync`. |
| **Wire entry points** | Crawl post-ingest, document upload, reindex, scheduler, Gmail index (when async). |
| **Reindex durability** | Replace or supplement in-memory `_jobs` in [`embeddings.py`](backend/app/routes/embeddings.py) with DB-backed jobs. |

### Job types (examples)

- `crawl_ingest` — after crawl completes
- `document_ingest` — file upload
- `reindex` — project reindex
- `gmail_index` — staged inbox selection

### Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `INGEST_MODE` | `inline` | `inline` = Phase 1; `queue` = Redis worker |
| `REDIS_URL` | (existing / app default) | Queue broker |

### Deployment

1. Process 1: `uvicorn app.main:app` — chat, CRUD, enqueue only when `INGEST_MODE=queue`
2. Process 2+: `python -m app.worker` — one or more replicas
3. Optional: `CHROMA_MODE=http` Chroma sidecar for multi-container setups

**Constraint:** Do not run multiple uvicorn workers with `INGEST_MODE=inline` and in-memory crawl tasks; use queue mode or a single worker.

### API compatibility

| Endpoint | Behavior |
|----------|----------|
| Crawl start | Same response; ingest in worker when queue mode |
| Documents upload | Same unless client polls optional `ingest_job_id` |
| Reindex | Same progress API shape; state in DB |
| Gmail index | Unchanged unless `GMAIL_INDEX_ASYNC=true` |

### Rollout

1. Deploy migration + code with `INGEST_MODE=inline`
2. Staging: start one worker, set `INGEST_MODE=queue`
3. Validate same chunk counts / `trained_at` as inline on a test project
4. Production: enable queue; scale workers as needed
5. Rollback: `INGEST_MODE=inline` and stop workers

### Rollback

`INGEST_MODE=inline` + stop worker processes. No need to delete `ingest_jobs` table.

---

## Phase comparison

| | Phase 1 (done) | Phase 2 | Phase 3 |
|---|----------------|---------|---------|
| **Fixes chat freeze** | Yes (thread pool) | Helps under load | Yes (process isolation) |
| **New processes** | No | No | Yes (worker) |
| **New infra** | No | No | Redis queue (already in stack) |
| **Risk** | Low | Low (flags off) | Medium (ops) |

---

## Suggested order

1. Use Phase 1 in production; tune `CRAWL_INGEST_BATCH_SIZE` / `INGEST_BATCH_PAUSE_MS` if needed.  
2. Add Phase 2 only if you hit capacity or fairness issues.  
3. Add Phase 3 only if you need scale-out or durable background jobs.
