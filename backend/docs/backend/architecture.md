# Backend Architecture

**Last updated:** 2026-07-03

---

## Runtime processes

| Process | Command | Responsibility |
|---------|---------|----------------|
| API | `uvicorn app.main:app` / Gunicorn | HTTP, auth, enqueue jobs, RAG queries |
| Worker | `python -m app.worker` | Claim `background_jobs`, crawl, ingest, sync |
| Scheduler | In API lifespan (`ENABLE_SCHEDULER=true`) | Cron: crawls, Gmail, connectors, WAITING promotion, job archive |
| ChromaDB | Sidecar when `CHROMA_MODE=http` | Vector store HTTP server |

Production (supervisor): `ragsuite-backend`, `ragsuite-worker`, optional `ragsuite-chromadb`.

---

## Request lifecycle

```text
HTTP Request
  → CORS middleware
  → Rate limiter (slowapi)
  → Route handler
  → Auth dependency (JWT / API key / widget)
  → Optional: get_active_project, require_org_admin, require_project_permission
  → Service layer
  → SQLAlchemy session (PostgreSQL)
  → Optional: enqueue background_jobs / Chroma / Redis
  → Pydantic response (schemas.py)
```

---

## Router registration (`main.py`)

Routers are included inside a **lifespan** context manager:

**Startup:** DB connect, Redis, RAG warmup, scheduler, inline worker (if enabled), stale job recovery, production guards.

**Always loaded:** `crawl`, `analytics`, `health`, `webhooks`, `chat_models`, `search_models` (3 routers).

**Conditional (try/import):** `rag`, `retrieve`, `documents`, `projects`, `gmail`, `connectors`, `connectors_notion`, `clickup`, `audit`, and others.

**Static/widget:** `/api/v1/widget/v1/*`, `/api/v1/search-widget/v1/*`, `/api/v1/avatars/*`.

---

## Data stores

| Store | Role | Isolation key |
|-------|------|----------------|
| PostgreSQL | Users, projects, settings, jobs, audit, connectors | `project_id`, `user_id`, `org_id` |
| ChromaDB | Vector embeddings | Collection per `project_id` (when `PER_PROJECT_DEFAULT_COLLECTION`) |
| Redis | Sessions, rate limits, OAuth state, admission counters, scheduler locks | Key prefixes |
| Filesystem | Document staging (`DOCUMENT_STAGING_DIR`), avatars | Per project paths in metadata |

---

## RAG pipeline (server)

```text
POST /chat/message or /search/query
  → get_project_id_or_user (widget) or JWT+project (admin)
  → search_run_context / chat handler
  → query_runtime (thread pool)
  → rag/singleton.py → embed query → Chroma query → rerank
  → source_display_policy (confidence/overlap filters)
  → llmconn → provider API
  → stream or JSON response + sources + execution_snapshot
  → search_persist (async analytics, QueryLog, ChatMessage)
```

Ingest (upload/crawl/connector):

```text
Enqueue DOCUMENT_INGEST or inline ingest_runtime
  → locked_ingest (global or per-collection lock)
  → chunk → embed → Chroma add + UploadedDocument/Document metadata
```

---

## Multi-tenancy today

- **Project** is the primary data boundary (`project_id` on sources, documents, messages, API keys).
- **User** owns projects (`Project.owner_id`).
- **Organization** — one per deployment; quotas, users, SSO config. See [organization-and-sso.md](./organization-and-sso.md).
- **ACL** — `organization_members`, `project_members`; enforced on org routes, projects, crawl (partial rollout).

---

## Concurrency & fairness

- Postgres `background_jobs` with `SKIP LOCKED` claiming
- Fair round-robin by `user_id` when enabled
- Per-project ingest caps (`MAX_CONCURRENT_INGEST_PER_PROJECT`, `MAX_QUEUED_INGEST_PER_PROJECT`)
- Crawl worker thread cap (`JOB_WORKER_CRAWL_THREADS`)
- Global Chroma write lock (local mode); per-collection when `CHROMA_MODE=http` + `ENABLE_CHROMA_PER_COLLECTION_LOCK`

See [../multi-tenant-scaling-roadmap.md](../multi-tenant-scaling-roadmap.md).

---

## Key files for common tasks

| Task | Files |
|------|--------|
| New REST route | `routes/*.py`, `schemas.py`, register in `main.py` |
| New DB table | `models.py`, `alembic/versions/*.py` |
| Background job | `models.BackgroundJobType`, `job_queue.py` handler |
| Scheduled task | `scheduler.py` |
| New connector | `services/connectors/{platform}.py`, `routes/connectors_{platform}.py`, `framework.py` |
| Auth change | `auth.py`, `routes/crawl.py` (auth endpoints) |
| Config | `settings.py`, `.env.example` |
