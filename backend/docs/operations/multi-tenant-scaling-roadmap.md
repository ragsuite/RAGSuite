# Multi-Tenant RAG Platform — Scaling Roadmap

**Status:** Sprint 1 **implemented** (May 2026) — run `alembic upgrade head` before deploy  
**Context:** FastAPI + Postgres job queue + ChromaDB + shared ingest/query pools  
**Core insight:** The system is **data-isolated** but **not resource-isolated** — the transition from MVP SaaS to production multi-tenant.

**Ratings:**

| Lens | Score | Notes |
|------|-------|--------|
| Direction / diagnosis | **8.5–9/10** | Real bottlenecks, sensible phasing |
| As-written implementability | **6.5/10** | SQL bug, scheduler bypasses, missing guards |
| After pre-Sprint-1 fixes below | **~8.5/10** | Safe to execute |

**Timeline:** Sprint 1 is realistically **2–3 weeks**, not 1–2.

---

## Executive summary

| Layer | Today | Target |
|-------|--------|--------|
| Data | Per-project Chroma collections, auth on APIs | Keep |
| Queue | Global FIFO (`queued_at`) | **Crawl worker cap first**, then simple round-robin by `user_id` |
| Capacity | Per-user crawl cap (2 active), upload cap (200 queued) | + per-project ingest caps (DB-enforced), WAITING sweeper |
| Workers | Crawl = one long job blocking a thread | Split fetch vs ingest; unified queue for reindex |
| Vector writes | Global `chroma_write_lock` | Per-collection locks **only** when `CHROMA_MODE=http` |
| Ops | In-process metrics endpoint | Prometheus/Grafana + load-test gates |
| Queue broker | Postgres + polling + `SKIP LOCKED` | Keep for now; Redis/Kafka **only when scale demands it** |

---

## Design principles (agreed)

1. **Resource isolation matters more than data isolation** at this stage.
2. **Simple first** — avoid WFQ, DRR, and weighted scheduling until scale proves you need them.
3. **Crawl worker isolation beats fair queueing** — fair queue fails if every worker runs a crawl.
4. **DB-based caps before Redis** — fewer distributed consistency bugs; easier debugging; no counter leaks.
5. **Do not rewrite everything** — phased rollout preserves features and reduces risk.
6. **Postgres queue is fine for now** — do not move to Redis Streams / Kafka until polling or `SKIP LOCKED` contention hurts.
7. **Ship indexes in the same migration as fair queue** — without composites, fair claim becomes a full table scan every 1.5s.
8. **No feature flags for every Sprint 1 behavior** — too many untested combinations at MVP scale; env settings + rollback are enough (exception: Chroma per-collection lock in Sprint 2).

---

## Pre-Sprint 1 blockers (fix before fair queue)

These are **not optional** — implementing fair queue without them causes crashes or undermines fairness.

| # | Fix | Why | Where |
|---|-----|-----|--------|
| 1 | **Fair queue SQL: `GROUP BY user_id`** | `ORDER BY MIN(queued_at)` without `GROUP BY` is invalid in Postgres | `job_queue.py` |
| 2 | **Multi-worker + local Chroma guard** | `WEB_CONCURRENCY>1` + SQLite Chroma → corruption | `main.py` lifespan |
| 3 | **`promote_waiting_crawls()` must loop** | Current code promotes **one** job per call; with 2 free slots only one WAITING moves | `concurrency_limits.py` |
| 4 | **Route scheduler bypasses through queue** | Inline ingest/sync bypasses fair queue and caps | `scheduler.py` |

**Fair queue SQL (correct):**

```sql
SELECT user_id
FROM background_jobs
WHERE status = 'PENDING' AND user_id IS NOT NULL
GROUP BY user_id
ORDER BY MIN(queued_at)
LIMIT :limit;
```

**`promote_waiting_crawls` loop (required):**

```python
def promote_all_waiting_for_user(db, user_id: int) -> int:
    promoted = 0
    while promote_waiting_crawls(db, user_id):
        promoted += 1
    return promoted
```

---

## Scheduler bypass gaps (roadmap must address)

Fair queue on `background_jobs` is **insufficient** until these paths enqueue instead of running inline:

| Path | Today | Risk |
|------|--------|------|
| `check_and_ingest_data_folder()` | `run_ingest_sync(locked_ingest, ...)` directly | Holds global Chroma lock; no per-project cap |
| `sync_gmail_integrations()` | `_run_gmail_sync_thread()` inline | Competes with workers on Chroma lock |

**Sprint 1 minimum:** document + limit frequency, or enqueue `DOCUMENT_INGEST` / `GMAIL_SYNC` jobs.  
**Sprint 2 target:** all scheduled ingest through `background_jobs`.

---

## What is already good

These are production-minded choices most MVP RAG apps lack:

- Postgres queue with `SKIP LOCKED` claiming
- Separate **query pool** vs **ingest pool**
- Startup stale recovery (ingest, crawl, reindex)
- Per-project Chroma collections
- **WAITING** crawl state instead of hard 429
- Async uploads via `background_jobs`
- DB/vector compensation logic
- Per-user concurrency caps (crawl, reindex)

---

## Biggest architectural problem today

**A CRAWL job occupies a worker thread for the entire crawl lifecycle** (fetch → embed → index → batching).

That destroys:

- Fair scheduling (even with fair queue, 4 workers can all run crawls)
- Worker utilization
- Cross-tenant latency for uploads and purges

### Sprint 1 priority order (agreed)

| Order | Item | Why |
|-------|------|-----|
| **1** | **Crawl worker isolation / cap** | Main hidden killer — do this before or with fair queue |
| **2** | Simple round-robin fair queue by `user_id` | Stops one tenant from owning FIFO |
| **3** | **WAITING sweeper** (60s) + **loop promote** | Ship with or before fair queue — crash-safe |
| **4** | Per-project ingest caps (DB) | Protects Chroma + queues per project |
| **5** | Scheduler bypass → queue (minimum: document limits) | Otherwise fairness is partial |
| — | Batched reindex in main queue | **Moved to Sprint 2** — non-trivial vs `ReindexJob` table |

**Fair queueing alone does not fix this** — crawl worker isolation in Sprint 1; **crawl fetch vs ingest split** in Sprint 3 is the long-term fix.

---

## Long-term architectural direction (Sprint 3)

This is the transition from a **background task system** to a **real distributed ingest pipeline**:

```text
crawl_fetch
  → pages persisted (DB)
  → enqueue small crawl_ingest_batch jobs
  → fair ingest workers (round-robin, per-project caps)
```

Benefits: fair scheduling, retries, observability, workers not held for hours.

---

## Severity matrix (audit highlights)

| # | Finding | Severity | Sprint |
|---|---------|----------|--------|
| 1 | Global Chroma write lock | Critical | 2 |
| 2 | Crawl = one long worker job | Critical | 1 (partial), 3 (full) |
| 3 | Global FIFO job queue | High | 1 |
| 4 | No per-project fairness | High | 1 |
| 5 | Unbounded WAITING crawls | High | 1 |
| 6 | Reindex outside queue (`threading.Thread`) | High | 2 |
| 11 | Scheduler bypasses (`data_folder`, Gmail) | High | 1–2 |
| 12 | `promote_waiting_crawls` no loop | Medium | Pre-Sprint 1 |
| 13 | `job_worker_max_per_tick` × threads can claim many crawls | High | 1 (crawl cap) |
| 7 | Local Chroma + multi-replica | Critical | 2 (http mode) |
| 8 | Ingest retry idempotency | High | 1 |
| 9 | WAITING promotion only on crawl complete | Medium | 1 |
| 10 | Metrics not tenant-aware | Medium | 1 (minimal), 2 (full) |

---

## Phase 1 — Immediate stabilization (highest ROI)

Do these **before** scaling user count.

### 1. Crawl worker isolation / cap — **P0 #1**

**Implement first** — more important than fair queueing.

**Option A (recommended):** Dedicated worker threads — e.g. `JOB_WORKER_CRAWL_THREADS=1`, `JOB_WORKER_INGEST_THREADS=3` (configurable).

**Option B:** Global cap — max N concurrent `CRAWL` jobs running per process.

**Why:** Even perfect fair queueing fails if all workers become crawl workers.

**Files:** `backend/app/services/job_queue.py`, `backend/app/settings.py`

---

### 2. Simple fair queueing (round-robin only) — **P0 #2**

**Implement:**

- Round-robin claim by `user_id` in `_claim_next_jobs`
- Handle `user_id IS NULL` (system jobs) in a separate low-priority bucket

**Do NOT implement yet:**

- Weighted fair queueing (WFQ)
- Deficit round robin (DRR)
- Weighted / priority scheduling beyond a simple `priority` column in Sprint 2

**Reason:** Extra complexity, harder debugging, unnecessary at current scale. Evolve when metrics show starvation after Sprint 1–2.

**Hard blocker:** ship `idx_bg_jobs_status_user_queued` in the **same migration** as fair claim (see [Database index requirements](#database-index-requirements-sprint-1)).

**Also:** `job_worker_max_per_tick=5` × `job_worker_threads=4` can claim up to **20 jobs per poll** — crawl cap must apply at **claim time**, not only thread pools.

**Pseudocode — simple round-robin claim (valid Postgres SQL):**

```python
def claim_next_fair(db, limit: int) -> list[BackgroundJob]:
    tenants = db.execute("""
        SELECT user_id FROM background_jobs
        WHERE status = 'PENDING' AND user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY MIN(queued_at)
        LIMIT :limit
    """)
    claimed = []
    for uid in tenants:
        job = (
            db.query(BackgroundJob)
            .filter(status=PENDING, user_id=uid)
            .order_by(queued_at)
            .with_for_update(skip_locked=True)
            .first()
        )
        if job:
            mark_running(job)
            claimed.append(job)
    return claimed
```

**Files:** `backend/app/services/job_queue.py`, `backend/app/settings.py`

---

### 3. Per-project ingest caps (DB-enforced) — **P0 #3**

**Add env vars:**

```env
MAX_CONCURRENT_INGEST_PER_PROJECT=2    # staging: 1, prod start: 2
MAX_QUEUED_INGEST_PER_PROJECT=50       # prod: 50–100
```

**Enforce via Postgres (Sprint 1) — not Redis:**

1. **API enqueue** — HTTP 429 when over cap
2. **Worker claim** — skip projects over cap (race-safe)

Count `PENDING + RUNNING` `DOCUMENT_INGEST` jobs with matching `project_id` on `background_jobs`.

**Why DB first:** Simpler, auditable, no distributed counter leaks. **Redis admission counters** → defer until horizontal worker scale (Sprint 4).

**Protects:** Chroma, embedding workers, queue depth per project.

**Files:** `backend/app/routes/documents.py`, `backend/app/services/job_queue.py`, `backend/app/settings.py`

---

### 4. WAITING crawl sweeper — **P0 #4**

**Risk today:** If a process crashes, WAITING jobs may never promote. WAITING jobs have **no `BackgroundJob` row** until promotion.

**Add:**

- Periodic task: `promote_waiting_crawls_every_60s()` — **loop** until user at cap or no WAITING left
- **Soft cap:** log + alert when user has **>10** WAITING crawls (no hard 409 at MVP — avoids new UX for rare edge case)
- Metric: `crawl_waiting_oldest_age_seconds`, `crawl_waiting_count`
- **Fix existing code:** `promote_waiting_crawls()` in `concurrency_limits.py` only promotes one job per call today

**Sweeper logic:**

```text
every 60s:
  for each user with WAITING crawl_jobs:
    while active_slots < cap and waiting_jobs exist:
      promote_waiting_crawls(user_id)
```

**Optional:** `BackgroundJob` in deferred state when `CrawlJob` is WAITING.

**Files:** `backend/app/services/concurrency_limits.py`, `backend/app/services/scheduler.py`

---

### 5. Reindex into main queue (batched) — **Sprint 2**

**Good design** — avoids monolithic jobs that starve workers.

**Why not Sprint 1:** `ReindexJob` is a separate table today; moving to `background_jobs` needs migration + handler + progress API alignment — non-trivial.

**Sprint 1 interim:** keep `threading.Thread` path but enforce `assert_can_start_reindex` + per-project caps where possible.

**Sprint 2 requirement:** enqueue **`reindex_batch`** jobs (N documents per job), not one `reindex_project` job.

**Files:** `backend/app/routes/embeddings.py`, `backend/app/services/job_queue.py`

---

### 6. Sprint 1 additions (do not skip)

| Task | Priority | Why |
|------|----------|-----|
| Ingest idempotency on retry | P0 | Retries must not duplicate chunks |
| Worker tenant assertion | P0 | `job.user_id` vs document/source owner before side effects |
| Minimal queue metrics on health endpoint | P0-lite | Extend `/api/v1/health/concurrency-metrics` (Chroma lock wait already in `snapshot_metrics`) |
| Chroma local + multi-worker guard | **Pre-Sprint 1** | Fail fast if `WEB_CONCURRENCY > 1` and `CHROMA_MODE=local` — **not in codebase yet** |
| Scheduler bypass audit | P0 | `check_and_ingest_data_folder`, `sync_gmail_integrations` |

---

## Phase 2 — Remove major bottlenecks

### Replace global Chroma lock — **P0 before horizontal scale**

**Current:** One write at a time globally (`chroma_write_lock` in `singleton.py`).

**Target (only if `CHROMA_MODE=http`):**

```python
_collection_locks: dict[str, threading.RLock] = {}

def collection_write_lock(collection: str):
    # per-collection RLock; different projects can write in parallel
```

### ⚠️ NEVER per-collection locks with local / SQLite Chroma

| `CHROMA_MODE` | Lock strategy |
|---------------|---------------|
| `local` (SQLite) | **Global lock only** — per-collection locks risk corruption |
| `http` | Per-collection locks allowed (gated by `CHROMA_PER_COLLECTION_LOCK`) |

Queries must not acquire the write lock.

**Files:** `backend/app/services/rag/singleton.py`, `backend/app/settings.py`  
**Reference:** [Ingest performance plan (Phase 2/3)](./roadmap.md)

---

### Queue priorities — **P1 (Sprint 2, keep simple)**

Add columns on `background_jobs`:

- `priority` (int) — small integer tiers, not WFQ
- `job_class` (`interactive` | `batch`)

| Tier | Job types |
|------|-----------|
| P1 | Single-doc upload, user-triggered |
| P2 | Crawl ingest batches |
| P3 | Reindex, purge, scheduled crawl |

---

## Phase 3 — Production observability

### Metrics — **P1 full stack; P0-lite in Sprint 1**

| Metric | Purpose |
|--------|---------|
| Queue depth by `job_type`, `user_id` | Fairness debugging |
| Oldest job age by `job_type` | Starvation detection |
| Chroma lock wait p95 | Vector bottleneck |
| Per-user / per-project active ingest | Capacity |
| Active workers / threads (crawl vs ingest) | Utilization |
| Ingest throughput (chunks/sec) | Capacity planning |
| WAITING crawl count & oldest age | Promotion failures |

**Sprint 1:** Extend `/api/v1/health/concurrency-metrics`.  
**Sprint 2:** Prometheus + Grafana + alerts.

---

## Phase 4 — Horizontal scalability

**Only after Phases 1–2 pass load tests.**

### Separate API and workers — **P2**

| Process | Responsibility |
|---------|----------------|
| API (`uvicorn`) | HTTP, auth, enqueue only |
| Worker (`python -m app.worker`) | Claim jobs, ingest, crawl |
| Scheduler | Cron, WAITING sweeper, stale cleanup |

### Split crawl fetch vs ingest — **Sprint 3**

See [Long-term architectural direction](#long-term-architectural-direction-sprint-3).

### When Postgres queue becomes a bottleneck

**Fine for now.** Eventually you may hit:

- Poll overhead
- `SKIP LOCKED` contention under many workers
- Queue scan cost for fairness queries
- Heavy metrics queries on `background_jobs`

**Then consider:** Redis Streams, RabbitMQ, or Kafka — **not in Sprint 1–3**.

**Sprint 4 (optional):**

- Horizontal worker replicas
- External queue if Postgres claim is hot
- **Redis admission counters** (only with multi-worker + clear TTL/release semantics)
- Vector DB scaling (sharded Chroma / Qdrant / pgvector)
- Org-level quotas

---

## Future scheduling (do not implement now)

Documented for later — only after simple round-robin + caps + metrics show gaps:

- **WFQ** — weighted fair queueing by tenant weight
- **DRR** — deficit round robin
- **Hierarchical caps** — org → user → project

```text
org_cap ≥ sum(user_caps)
user_cap ≥ sum(project_caps)
project_cap = max concurrent ingest + max queued ingest
```

---

## Future admission control (Sprint 4+)

Redis counters are useful **after** horizontal workers — not Sprint 1.

```python
# Sprint 4+ only — prefer DB counts until then
class IngestAdmission:
    def try_acquire(self, user_id: int, project_id: str) -> bool:
        u = redis.incr(f"ingest:active:user:{user_id}")
        p = redis.incr(f"ingest:active:project:{project_id}")
        # ... cap checks + TTL + finally: decr on completion
```

**Sprint 1–3:** Use `COUNT(*)` on `background_jobs` + claim-time checks.

---

## Recommended implementation order

### Sprint 1 — Stop the bleeding (**2–3 weeks**)

**Pre-Sprint 1 (do first):**

- [x] Fix `promote_waiting_crawls` to loop (or wrapper `promote_all_waiting_for_user`)
- [x] Add lifespan guard: `WEB_CONCURRENCY > 1` + `CHROMA_MODE=local` → fail fast
- [x] Fix fair-queue SQL (`GROUP BY user_id`) when implementing claim

**Sprint 1 order:**

- [x] **1.** Dedicated crawl vs ingest worker threads + crawl cap at **claim** time
- [x] **2.** WAITING sweeper (60s) + loop promote + soft alert at 10 WAITING
- [x] **3.** Simple fair round-robin claim by `user_id` + **composite indexes (same migration)**
- [x] **4.** Per-project ingest caps — **DB enforced** (enqueue + claim)
- [x] **5.** Scheduler bypass: enqueue or throttle `data_folder` / Gmail sync
- [x] Ingest idempotent retry
- [x] Worker tenant checks on job handlers
- [x] Extend concurrency-metrics: queue depth, oldest job age, WAITING age
- [x] Confirm job retention / archival is running (see below)

**Defer:** WFQ/DRR, Sprint 1 feature flags, hard WAITING 409, batched reindex, Redis admission, full crawl split, `CHROMA_MODE=http`, separate processes.

---

### Sprint 2 — Throughput & visibility (2–3 weeks)

- [x] `CHROMA_MODE=http` + per-collection locks (never on local SQLite); **only** feature flag: `ENABLE_CHROMA_PER_COLLECTION_LOCK`
- [x] Batched **reindex** via `background_jobs`
- [x] Full scheduler paths on queue (data folder, Gmail)
- [x] Simple job `priority` / `job_class` columns
- [x] Retry backoff + replay API (`POST /api/v1/analytics/jobs/{id}/retry`)
- [x] Extended observability: 24h completed/failed counts, queue depth by type
- [ ] Prometheus + Grafana + alerts *(deferred — extended JSON endpoint used instead)*
- [ ] **Load-test acceptance criteria** *(deferred)*

---

### Sprint 3 — Structural (3–4 weeks)

- [x] Crawl: `crawl_fetch` → `crawl_ingest_batch` job chain
- [x] Separate worker entrypoint (`python -m app.worker`)
- [x] Scheduler leader lock already via Redis (`_try_acquire_scheduler_lock`)

---

### Sprint 4 — Multi-tenant scale

- [x] Horizontal worker replicas (separate `ragsuite-worker` supervisor program + `RUN_INLINE_WORKER` flag)
- [x] Redis admission counters with leak-safe TTL + DB fallback (`admission.py`)
- [x] Org-level quotas (`Organization` model + `_get_org_cap` at enqueue/claim)
- [x] Cold archive table (`job_archive`) replaces permanent DELETE
- [ ] Redis/Kafka queue *(deferred — Postgres queue sufficient at current scale)*
- [ ] Vector DB scaling / sharding *(deferred — Chroma HTTP mode already enabled)*

---

## Database index requirements (Sprint 1)

Fair queue and per-project cap queries will **full-scan** `background_jobs` without composite indexes. The model already has single-column indexes on `status`, `user_id`, `project_id`, `job_type`, and `queued_at` — that is not enough for the new access patterns.

**Ship these in the same migration as fair queue / project caps:**

```sql
-- Fair round-robin: DISTINCT user_id + claim oldest per user
CREATE INDEX IF NOT EXISTS idx_bg_jobs_status_user_queued
  ON background_jobs (status, user_id, queued_at)
  WHERE user_id IS NOT NULL;

-- Per-project ingest caps: COUNT by project + type + status
CREATE INDEX IF NOT EXISTS idx_bg_jobs_project_ingest
  ON background_jobs (project_id, job_type, status)
  WHERE project_id IS NOT NULL;

-- Optional: global pending claim fallback (FIFO path when fair queue off)
CREATE INDEX IF NOT EXISTS idx_bg_jobs_status_queued
  ON background_jobs (status, queued_at);
```

**WAITING crawl sweeper** (join `crawl_jobs` → `crawl_sources`):

```sql
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status_queued
  ON crawl_jobs (status, queued_at)
  WHERE status = 'WAITING';
```

**Verify after deploy:** `EXPLAIN ANALYZE` on fair-claim and project-cap queries — expect Index Scan, not Seq Scan on large tables.

| Query pattern | Index |
|---------------|--------|
| Pending jobs per user, oldest first | `idx_bg_jobs_status_user_queued` |
| Active/queued ingest per project | `idx_bg_jobs_project_ingest` |
| Archival delete by `finished_at` | `idx_bg_jobs_finished_at` (add in Sprint 2 if missing) |

---

## Queue cleanup & retention

`background_jobs` will grow without retention — fairness queries and `COUNT(*)` caps get slower over time even with indexes.

### Already in codebase

- `archive_old_jobs(retention_days=30)` in `job_queue.py` — deletes `COMPLETED` and `FAILED` rows older than retention
- Scheduler job `archive_old_background_jobs` runs weekly (see `scheduler.py`)

### Roadmap requirements

| Item | When | Notes |
|------|------|--------|
| Keep weekly archival enabled | Sprint 1 | Confirm in prod; alert if job stops |
| Env-configurable retention | Sprint 1 | e.g. `BACKGROUND_JOB_RETENTION_DAYS=30` |
| Metric: `background_jobs` row count by `status` | Sprint 1 metrics | Early warning before scans hurt |
| Index on `finished_at` for archival DELETE | Sprint 1–2 | Speeds weekly cleanup |
| Archive to cold storage (S3 / `job_archive` table) | Sprint 4+ | Before strict compliance needs |
| Table partitioning by `queued_at` month | Sprint 4+ | If millions of rows |

**Policy (default):**

```text
DELETE FROM background_jobs
WHERE status IN ('completed', 'failed')
  AND finished_at < now() - interval '30 days';
```

Do **not** delete `PENDING` / `RUNNING` except via stale-recovery paths already implemented.

**Sprint 1 checklist:** retention days set in env; weekly archive job confirmed in logs; dashboard or health metric for table size.

---

## Feature flags (minimal)

At MVP scale, **do not** flag every Sprint 1 behavior — mixed flag states (FIFO claim + cap enqueue) create untested combinations.

| Approach | Sprint |
|----------|--------|
| Ship crawl isolation, fair queue, caps, sweeper **on** via env numeric settings | 1 |
| Roll back by redeploy or tuning env (e.g. `JOB_WORKER_CRAWL_THREADS=4`) | 1 |
| **`ENABLE_CHROMA_PER_COLLECTION_LOCK` only** | 2 — dangerous if enabled with local SQLite |

---

## Load-test acceptance criteria (Sprint 2+)

| Scenario | Pass criteria (example — tune to your SLO) |
|----------|---------------------------------------------|
| User A: 200 uploads; User B: 10 uploads | B’s first doc starts within **5 min** |
| User A: 2 active crawls + 15 WAITING | Promotion within **60s** of slot free; no WAITING older than **24h** |
| Reindex 5k docs + steady chat | Chat p95 within defined SLO |
| Crash mid-WAITING / mid-RUNNING | Recovery on restart; no permanent WAITING |
| 4 concurrent crawls + uploads | Upload jobs not blocked > **X min** (requires crawl worker cap in Sprint 1) |

---

## Configuration reference (proposed)

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_CONCURRENT_CRAWLS_PER_USER` | `2` | Active crawl slots (existing) |
| `WAITING_CRAWL_ALERT_THRESHOLD` | `10` | Log/alert only — soft cap (no 409) |
| `MAX_CONCURRENT_INGEST_PER_PROJECT` | `2` | Active ingest per project — DB count (new) |
| `MAX_QUEUED_INGEST_PER_PROJECT` | `50` | Queued ingest per project — DB count (new) |
| `MAX_QUEUED_INGEST_JOBS` (per user) | `200` | Existing upload cap |
| `JOB_WORKER_CRAWL_THREADS` | `1` | Crawl-dedicated worker threads (**Sprint 1 #1**) |
| `JOB_WORKER_INGEST_THREADS` | `3` | Ingest/purge/webhook threads |
| `WAITING_CRAWL_PROMOTE_INTERVAL_SEC` | `60` | Sweeper interval |
| `CHROMA_PER_COLLECTION_LOCK` | `false` | **Only** with `CHROMA_MODE=http` |
| `BACKGROUND_JOB_RETENTION_DAYS` | `30` | Delete completed/failed jobs (existing archival) |
| `ENABLE_CHROMA_PER_COLLECTION_LOCK` | `false` | **Sprint 2 only** — requires `CHROMA_MODE=http` |

---

## Code-validated audit (summary)

Validated against `job_queue.py`, `concurrency_limits.py`, `scheduler.py`, `singleton.py`, `main.py`.

### Confirmed strengths

- Global FIFO at `_claim_next_jobs()` — `ORDER BY queued_at` only
- Crawl blocks worker: `asyncio.run(_process_crawl)` in `_process_job_sync()`
- Global `_ingest_lock` on all Chroma writes
- WAITING promotion only on crawl complete/fail — **no periodic sweeper**
- Archival exists: `archive_old_jobs()` + weekly scheduler
- `/api/v1/health/concurrency-metrics` exposes Chroma lock wait via `snapshot_metrics()`

### Confirmed gaps (addressed in this doc)

| Gap | Status in roadmap |
|-----|-------------------|
| Invalid fair-queue SQL (`DISTINCT` + `MIN` without `GROUP BY`) | Fixed in pseudocode |
| `promote_waiting_crawls` single promotion | Pre-Sprint 1 fix |
| Multi-worker + local Chroma guard missing | Pre-Sprint 1 fix |
| Scheduler bypasses | Sprint 1–2 |
| Indexes not optional | Hard blocker with fair queue |

### Simplified per audit

- Drop Sprint 1 feature flags (except Chroma lock in Sprint 2)
- WAITING: soft alert, not hard 409
- Batched reindex → Sprint 2
- Load-test gates → Sprint 2
- Redis admission → optional / years out

### Known but deferred

- `asyncio.run()` per crawl → new event loop / Playwright memory (document in Sprint 3 crawl split)
- Worth executing Sprint 1 now: ~10 concurrent active users will stress 4 worker threads + global Chroma lock

---

## Review consensus (changelog)

| Topic | Decision |
|-------|----------|
| Fair queue | Simple round-robin + valid `GROUP BY` SQL; no WFQ/DRR |
| Sprint 1 order | Crawl isolation → **WAITING sweeper** → fair queue + indexes → project caps |
| Pre-Sprint 1 | SQL, Chroma guard, promote loop, scheduler bypass plan |
| Admission control | **DB counts**; Redis deferred |
| Chroma locks | Per-collection **only** with `http`; **never** local SQLite |
| Reindex | Batched jobs — **Sprint 2** |
| Feature flags | **Chroma only** in Sprint 2; ship Sprint 1 without multi-flags |
| WAITING cap | Soft alert at 10, not 409 |
| Ratings | 6.5/10 as-written → ~8.5/10 after pre-Sprint-1 fixes |
| Timeline | Sprint 1: **2–3 weeks** |

---

## Related docs

- [Ingest performance plan (Phase 2/3)](./roadmap.md)
- [Architecture](../architecture.md)
- [Deployment](./deployment.md)
- [Planned features](../planned/README.md)

---

## Bottom line

Ship **Pre-Sprint 1 fixes**, then Sprint 1: **crawl worker cap (at claim) → WAITING sweeper + loop promote → fair queue + indexes (same migration) → DB per-project caps → scheduler bypass plan → idempotency → extend concurrency-metrics**.

Do not implement fair-queue SQL verbatim from early drafts (missing `GROUP BY`). Do not add multi-flag Sprint 1 rollouts. Batched reindex and formal load tests belong in **Sprint 2**. The highest-leverage long-term change remains **crawl fetch vs ingest decomposition** (Sprint 3).

Until crawl stops monopolizing workers and Chroma writes serialize globally (until `http` + per-collection locks), adding users will convert shared resources into **tail-latency failures** for everyone — even with correct per-project data isolation.
