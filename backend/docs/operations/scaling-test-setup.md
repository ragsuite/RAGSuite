# Multi-tenant scaling — local test setup

Uses everything from [multi-tenant-scaling-roadmap.md](./multi-tenant-scaling-roadmap.md) (Sprints 1–4).

## 1. One-time setup

```bash
cd backend
cp .env.scaling-test .env   # or merge the scaling block from .env.scaling-test into your .env
.venv/bin/alembic upgrade head
.venv/bin/python scripts/scaling_test_setup.py
```

## 2. Start stack

```bash
cd backend
./start.sh
```

This starts: Redis → Chroma HTTP → **separate worker** → API (2 gunicorn workers) → frontend.

Or manually:

```bash
# terminal 1 — Chroma
.venv/bin/chroma run --host 127.0.0.1 --port 8001 --path rag_db_local

# terminal 2 — worker
.venv/bin/python -m app.worker

# terminal 3 — API
RUN_INLINE_WORKER=false WEB_CONCURRENCY=2 .venv/bin/gunicorn app.main:app -c gunicorn.conf.py
```

## 3. What is enabled (`.env` scaling block)

| Flag | Test purpose |
|------|----------------|
| `RUN_INLINE_WORKER=false` | Worker separate from API (Sprint 4) |
| `ENABLE_CHROMA_PER_COLLECTION_LOCK=true` | Different projects can write Chroma in parallel |
| `ENABLE_REDIS_ADMISSION=true` | Fast caps via Redis (`redis-cli` to inspect) |
| `JOB_WORKER_CRAWL_THREADS=1` | Only one crawl fetch at a time globally |
| `MAX_QUEUED_INGEST_PER_PROJECT=10` | Easier to hit upload queue limit (429) |

## 4. Quick checks

```bash
cd backend
.venv/bin/python scripts/scaling_test_setup.py      # Redis, Chroma, DB, org seed
.venv/bin/python scripts/concurrency_stress_check.py # lock + DB smoke
```

**Redis counters** (after upload/crawl):

```bash
redis-cli KEYS 'ingest:*'
redis-cli GET 'crawl:running'
```

**Metrics:** `GET /api/v1/analytics/concurrency` (admin) — queue depth, WAITING crawls.

## 5. Two-account test (fair queue + caps)

1. Log in as **User A** and **User B** (two browsers or incognito).
2. Each starts a crawl + uploads several documents.
3. Expect: jobs alternate in `background_jobs` (fair queue); only one `CRAWL_FETCH` RUNNING at a time.
4. **Org quota test** (optional):

```bash
.venv/bin/python scripts/scaling_test_setup.py --seed-org
# Then in SQL or admin: set users.org_id = 2 for one test user
# Org slug `scale_test` has max_queued_ingest_per_project=2 → 3rd upload gets 429
```

## 6. Turn off for normal dev

Set in `.env`:

```bash
RUN_INLINE_WORKER=true
ENABLE_REDIS_ADMISSION=false
ENABLE_CHROMA_PER_COLLECTION_LOCK=false
MAX_QUEUED_INGEST_PER_PROJECT=50
```

Restart API/worker.
