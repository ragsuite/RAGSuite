# Sprint 4 Implementation Brief

> **Load this file at the start of a new session and execute without needing any other context.**
> Branch: `server`. Never push to GitLab remote — local commits only.
> Run `alembic upgrade head` after migrations before testing.
> Sprints 1–3 are complete. This is the final sprint.

---

## Goal

Multi-tenant horizontal scale. Four independent workstreams — implement in order:

1. **Separate worker process** — enable supervisor `ragsuite-worker` + wire API to not run workers
2. **Redis admission counters** — replace DB `COUNT(*)` cap checks with atomic Redis counters
3. **Cold archive table** — `job_archive` for COMPLETED/FAILED rows older than retention
4. **Org-level quotas** — `Organization` model + per-org caps enforced at enqueue

---

## Current state (what exists after Sprints 1–3)

### Process model
- Single process: API (`uvicorn`/`gunicorn`) runs workers inline via `start_job_worker()`
- `configs/supervisor/ragsuite.conf` has `ragsuite-worker` section but **commented out** (`autostart=false`)
- `backend/app/worker.py` exists — standalone entrypoint, calls `start_job_worker()` + sleeps
- `WEB_CONCURRENCY=2` in supervisor env → multi-worker gunicorn runs today
- Guard in `main.py` line 208–222: fails fast if `WEB_CONCURRENCY > 1` + Redis missing or Chroma not http

### Redis
- `backend/app/services/redis_client.py` — singleton `get_redis()`, returns `None` if unconfigured
- Used by scheduler for leader locks (`_try_acquire_scheduler_lock`)
- **NOT used** for admission counters — all caps use DB `COUNT(*)` queries

### Cap functions (DB-based, to be replaced/augmented):
- `_count_running_crawls(db)` → `job_queue.py:166` — counts RUNNING CRAWL/CRAWL_FETCH rows
- `_count_running_ingest_for_project(db, project_id)` → `job_queue.py:178` — counts RUNNING DOCUMENT_INGEST per project
- `count_active_ingest_for_project(db, project_id)` → `job_queue.py:191` — counts PENDING+RUNNING DOCUMENT_INGEST per project (enqueue guard)

### Models
- `User` has `org_id: int nullable` (line 312) — foreign key placeholder, no `Organization` table yet
- `Project` has `org_id: int nullable` (line 339)
- No `Organization` model, no org quota fields

### Job archive
- `archive_old_jobs(retention_days)` in `job_queue.py` — DELETEs rows from `background_jobs`
- Runs weekly via scheduler
- No cold storage — rows are permanently deleted

### Latest Alembic head
`j3k4l5m6n7o8` (Sprint 3 — empty migration, no schema changes)

---

## Workstream 1 — Separate worker process

### Goal
API process never runs job workers. Workers run as a separate supervisor process.
Enables independent scaling: N API replicas + M worker replicas.

### Step 1a — `settings.py`: add `run_inline_worker` flag

```python
# When false, API process does not start background job workers.
# Workers run as a separate process (python -m app.worker).
# Set false in production when ragsuite-worker supervisor program is enabled.
run_inline_worker: bool = True
```

### Step 1b — `main.py`: gate `start_job_worker()` on the flag

Find the lifespan startup block where `start_job_worker()` is called. Wrap it:

```python
if settings.run_inline_worker:
    from .services.job_queue import start_job_worker, wait_for_job_worker
    start_job_worker()
    wait_for_job_worker(timeout_sec=15.0)
else:
    logger.info("run_inline_worker=false — job workers run as separate process")
    from .services.job_queue import _worker_started
    _worker_started.set()  # unblock any health checks that wait on this event
```

### Step 1c — `configs/supervisor/ragsuite.conf`: enable worker program

Change `autostart=false` → `autostart=true` for `ragsuite-worker`:

```ini
[program:ragsuite-worker]
command=/home/web/ragsuite/backend/.venv/bin/python -m app.worker
directory=/home/web/ragsuite/backend
user=web
autostart=true
autorestart=true
startretries=3
stopwaitsecs=40
stdout_logfile=/var/log/supervisor/ragsuite-worker.log
stdout_logfile_maxbytes=50MB
stdout_logfile_backups=5
stderr_logfile=/var/log/supervisor/ragsuite-worker-error.log
stderr_logfile_maxbytes=20MB
stderr_logfile_backups=3
environment=
    HOME="/home/web",
    RUN_INLINE_WORKER="false",
    PATH="/home/web/ragsuite/backend/.venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
```

Also add `RUN_INLINE_WORKER=false` to the API program's environment block so API doesn't also start workers.

### Step 1d — `.env.example`: document the flag

```
# Set false when running separate worker process (python -m app.worker via supervisor).
# RUN_INLINE_WORKER=true
```

---

## Workstream 2 — Redis admission counters

### Goal
Replace expensive `COUNT(*)` DB queries for cap enforcement with atomic Redis `INCR`/`DECR`.
Critical at horizontal scale — DB counts cause lock contention under many workers.

### Design
- Key `ingest:active:project:{project_id}` — count of RUNNING DOCUMENT_INGEST for a project
- Key `ingest:queued:project:{project_id}` — count of PENDING+RUNNING DOCUMENT_INGEST for a project
- Key `crawl:running` — global count of RUNNING CRAWL/CRAWL_FETCH jobs
- TTL: 2× `job_worker_stale_minutes` seconds on each key (leak-safe)
- Fallback: if Redis unavailable, fall back to existing DB COUNT (graceful degradation)

### Step 2a — New file `backend/app/services/admission.py`

```python
"""
Redis-backed admission counters for job caps.
Falls back to DB COUNT when Redis is unavailable.
Thread-safe: Redis INCR/DECR are atomic.
"""
from __future__ import annotations

import logging
import uuid
from typing import Optional

logger = logging.getLogger(__name__)

_TTL_SECONDS = 3600 * 2  # 2h — leak-safe TTL; real jobs complete in <30 min


def _redis():
    try:
        from .redis_client import get_redis
        return get_redis()
    except Exception:
        return None


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
    # DB fallback
    if db is not None:
        try:
            from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType
            return (
                db.query(BackgroundJob)
                .filter(
                    BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                    BackgroundJob.job_type.in_([
                        BackgroundJobType.CRAWL.value,
                        BackgroundJobType.CRAWL_FETCH.value,
                    ]),
                )
                .count()
            )
        except Exception:
            pass
    return 0


# --- Per-project ingest counters ---

def _ingest_active_key(project_id) -> str:
    return f"ingest:active:project:{project_id}"


def _ingest_queued_key(project_id) -> str:
    return f"ingest:queued:project:{project_id}"


def ingest_active_incr(project_id) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_active_key(project_id)
            r.incr(key)
            r.expire(key, _TTL_SECONDS)
        except Exception as e:
            logger.debug("admission ingest_active_incr redis error: %s", e)


def ingest_active_decr(project_id) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_active_key(project_id)
            val = r.decr(key)
            if val < 0:
                r.set(key, 0)
        except Exception as e:
            logger.debug("admission ingest_active_decr redis error: %s", e)


def ingest_queued_incr(project_id) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_queued_key(project_id)
            r.incr(key)
            r.expire(key, _TTL_SECONDS)
        except Exception as e:
            logger.debug("admission ingest_queued_incr redis error: %s", e)


def ingest_queued_decr(project_id) -> None:
    r = _redis()
    if r:
        try:
            key = _ingest_queued_key(project_id)
            val = r.decr(key)
            if val < 0:
                r.set(key, 0)
        except Exception as e:
            logger.debug("admission ingest_queued_decr redis error: %s", e)


def get_ingest_active(project_id, db=None) -> int:
    """Running DOCUMENT_INGEST count for project. Redis primary, DB fallback."""
    r = _redis()
    if r:
        try:
            val = r.get(_ingest_active_key(project_id))
            if val is not None:
                return max(0, int(val))
        except Exception as e:
            logger.debug("admission get_ingest_active redis error: %s", e)
    if db is not None:
        try:
            from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType
            return (
                db.query(BackgroundJob)
                .filter(
                    BackgroundJob.project_id == project_id,
                    BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                    BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                )
                .count()
            )
        except Exception:
            pass
    return 0


def get_ingest_queued(project_id, db=None) -> int:
    """PENDING+RUNNING DOCUMENT_INGEST count for project. Redis primary, DB fallback."""
    r = _redis()
    if r:
        try:
            val = r.get(_ingest_queued_key(project_id))
            if val is not None:
                return max(0, int(val))
        except Exception as e:
            logger.debug("admission get_ingest_queued redis error: %s", e)
    if db is not None:
        try:
            from ..models import BackgroundJob, BackgroundJobStatus, BackgroundJobType
            return (
                db.query(BackgroundJob)
                .filter(
                    BackgroundJob.project_id == project_id,
                    BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                    BackgroundJob.status.in_([
                        BackgroundJobStatus.PENDING.value,
                        BackgroundJobStatus.RUNNING.value,
                    ]),
                )
                .count()
            )
        except Exception:
            pass
    return 0
```

### Step 2b — `job_queue.py`: wire admission counters into claim + finish

**In `_claim_next_jobs`:**

Replace calls to `_count_running_crawls(db)` with:
```python
from .admission import get_crawl_running
crawl_cap_reached = get_crawl_running(db=db) >= crawl_cap
```

Replace calls to `_count_running_ingest_for_project(db, project_id)` with:
```python
from .admission import get_ingest_active
running = get_ingest_active(job.project_id, db=db)
```

**In `_mark_claimed` inner function (inside `_claim_next_jobs`):**
```python
def _mark_claimed(job: BackgroundJob) -> None:
    job.status = BackgroundJobStatus.RUNNING.value
    job.started_at = now
    job.attempts = (job.attempts or 0) + 1
    claimed.append(job)
    claimed_ids.add(job.id)
    # Increment Redis counters
    from .admission import crawl_running_incr, ingest_active_incr
    if job.job_type in (BackgroundJobType.CRAWL.value, BackgroundJobType.CRAWL_FETCH.value):
        crawl_running_incr()
    elif job.job_type == BackgroundJobType.DOCUMENT_INGEST.value and job.project_id:
        ingest_active_incr(job.project_id)
```

**In `_finish_job`:** decrement on completion/failure:
```python
def _finish_job(db, job, *, status, result=None, error=None):
    job.status = status
    job.result = result
    job.error = error
    job.finished_at = _utcnow()
    db.commit()
    # Decrement Redis counters
    from .admission import crawl_running_decr, ingest_active_decr, ingest_queued_decr
    if job.job_type in (BackgroundJobType.CRAWL.value, BackgroundJobType.CRAWL_FETCH.value):
        crawl_running_decr()
    elif job.job_type == BackgroundJobType.DOCUMENT_INGEST.value and job.project_id:
        ingest_active_decr(job.project_id)
        ingest_queued_decr(job.project_id)
```

**In `enqueue_document_ingest`:** increment queued counter on enqueue:
```python
# After enqueue_job() succeeds:
from .admission import ingest_queued_incr
if project_id:
    ingest_queued_incr(str(project_id))
```

**In `count_active_ingest_for_project`:** use Redis:
```python
def count_active_ingest_for_project(db: Session, project_id: uuid.UUID) -> int:
    from .admission import get_ingest_queued
    return get_ingest_queued(str(project_id), db=db)
```

### Step 2c — `settings.py`: flag to enable Redis admission

```python
# Use Redis atomic counters for job caps (requires Redis). Falls back to DB when false/unavailable.
enable_redis_admission: bool = False
```

Gate all `admission.py` functions on this flag:
```python
def _redis():
    try:
        from ...settings import settings
        if not getattr(settings, "enable_redis_admission", False):
            return None
        from .redis_client import get_redis
        return get_redis()
    except Exception:
        return None
```

---

## Workstream 3 — Cold archive table

### Goal
Stop permanently deleting COMPLETED/FAILED jobs. Move them to `job_archive` table.
Enables compliance audit trail + keeps `background_jobs` small for fast cap queries.

### Step 3a — `models.py`: add `JobArchive` model

```python
class JobArchive(Base):
    """Cold storage for completed/failed background jobs (retention archive)."""
    __tablename__ = "job_archive"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    queued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
```

### Step 3b — Alembic migration

File: `backend/alembic/versions/k4l5m6n7o8p9_sprint4_job_archive_org_quotas.py`

```python
"""Sprint 4: job_archive table + organizations table + org quota columns

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-05-27
"""
from alembic import op
import sqlalchemy as sa

revision = "k4l5m6n7o8p9"
down_revision = "j3k4l5m6n7o8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # job_archive table
    op.create_table(
        "job_archive",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("job_type", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("attempts", sa.Integer(), default=0),
        sa.Column("queued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_job_archive_finished_at", "job_archive", ["finished_at"])
    op.create_index("idx_job_archive_archived_at", "job_archive", ["archived_at"])
    op.create_index("idx_job_archive_job_type", "job_archive", ["job_type"])
    op.create_index("idx_job_archive_user_id", "job_archive", ["user_id"])

    # organizations table
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("max_users", sa.Integer(), default=0),        # 0 = unlimited
        sa.Column("max_projects", sa.Integer(), default=0),
        sa.Column("max_crawls_per_user", sa.Integer(), default=0),
        sa.Column("max_queued_ingest_per_project", sa.Integer(), default=0),
        sa.Column("max_concurrent_ingest_per_project", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Seed org 1 (default org for existing rows)
    op.execute(
        "INSERT INTO organizations (id, name, slug) VALUES (1, 'Default', 'default') "
        "ON CONFLICT DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table("organizations")
    op.drop_table("job_archive")
```

### Step 3c — `job_queue.py`: replace DELETE with INSERT+DELETE in `archive_old_jobs`

```python
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
                BackgroundJob.status.in_([
                    BackgroundJobStatus.COMPLETED.value,
                    BackgroundJobStatus.FAILED.value,
                ]),
                BackgroundJob.finished_at < cutoff,
            )
            .all()
        )
        if not old_jobs:
            return 0
        for job in old_jobs:
            archive_row = JobArchive(
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
            db.add(archive_row)
            db.delete(job)
        db.commit()
        logger.info("Archived %d old background job(s) to job_archive", len(old_jobs))
        return len(old_jobs)
    except Exception as exc:
        db.rollback()
        logger.error("Background job archival failed: %s", exc)
        return 0
    finally:
        db.close()
```

---

## Workstream 4 — Org-level quotas

### Goal
`Organization` row holds per-org cap overrides. At enqueue/claim time, org caps take precedence over global settings (when set; 0 = use global default).

### Step 4a — `models.py`: add `Organization` model

```python
class Organization(Base):
    """Multi-tenant organization with per-org quota overrides."""
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    # 0 = use global setting
    max_users: Mapped[int] = mapped_column(Integer, default=0)
    max_projects: Mapped[int] = mapped_column(Integer, default=0)
    max_crawls_per_user: Mapped[int] = mapped_column(Integer, default=0)
    max_queued_ingest_per_project: Mapped[int] = mapped_column(Integer, default=0)
    max_concurrent_ingest_per_project: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
```

### Step 4b — `job_queue.py`: resolve org cap at enqueue + claim

New helper:
```python
def _get_org_cap(db: Session, user_id: Optional[int], cap_field: str, global_val: int) -> int:
    """Return org-level cap for cap_field, falling back to global_val if not set."""
    if not user_id:
        return global_val
    try:
        from ..models import User, Organization
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
```

**In `count_active_ingest_for_project`** (enqueue guard) — caller in `documents.py` should use:
```python
cap = _get_org_cap(db, user_id, "max_queued_ingest_per_project",
                   settings.max_queued_ingest_per_project)
if count_active_ingest_for_project(db, project_id) >= cap:
    raise HTTPException(429, ...)
```

**In `_claim_next_jobs`** — replace hard-coded `settings.max_concurrent_ingest_per_project`:
```python
ingest_concurrent_cap = _get_org_cap(
    db, uid, "max_concurrent_ingest_per_project",
    max(0, int(settings.max_concurrent_ingest_per_project))
)
```

### Step 4c — `settings.py`: no new settings needed
Org quotas are stored in DB. Global settings remain as fallback defaults.

---

## Files to change (summary)

| File | What changes |
|------|-------------|
| `backend/app/settings.py` | Add `run_inline_worker: bool = True`, `enable_redis_admission: bool = False` |
| `backend/app/main.py` | Gate `start_job_worker()` on `run_inline_worker` setting |
| `backend/app/services/admission.py` | **NEW** — Redis admission counters with DB fallback |
| `backend/app/services/job_queue.py` | Wire admission counters into claim/finish/enqueue; `archive_old_jobs` → INSERT+DELETE; `_get_org_cap` helper; update cap resolution |
| `backend/app/models.py` | Add `Organization`, `JobArchive` models |
| `backend/alembic/versions/k4l5m6n7o8p9_sprint4_job_archive_org_quotas.py` | **NEW** — `job_archive` + `organizations` tables |
| `configs/supervisor/ragsuite.conf` | Enable `ragsuite-worker` program (`autostart=true`); add `RUN_INLINE_WORKER=false` to API env |
| `backend/.env.example` | Document `RUN_INLINE_WORKER`, `ENABLE_REDIS_ADMISSION` |

---

## Implementation constraints

1. **Redis admission is opt-in** (`enable_redis_admission=false` default) — must fall back to DB COUNT gracefully when Redis unavailable or flag off
2. **`archive_old_jobs` must be idempotent** — if `job_archive` row already exists (same `id`), skip (use `ON CONFLICT DO NOTHING` or catch IntegrityError)
3. **Org caps must be additive** — `0` always means "use global setting", never "deny all"
4. **Do not remove `_count_running_crawls` / `_count_running_ingest_for_project`** — kept as DB fallback inside `admission.py`
5. **`run_inline_worker=true` default** — existing local dev setups work unchanged
6. Commit locally only — never push to GitLab remote

---

## How to test after implementation

**Workstream 1 (separate worker):**
1. Set `RUN_INLINE_WORKER=false` in `.env`
2. Run API: `uvicorn app.main:app` — confirm log says "job workers run as separate process"
3. Run worker: `python -m app.worker` — confirm it starts and claims jobs
4. Upload doc → worker process logs it, not API process

**Workstream 2 (Redis admission):**
1. Set `ENABLE_REDIS_ADMISSION=true` + confirm Redis running
2. Upload doc → check `redis-cli get "ingest:queued:project:{id}"` increments
3. Complete job → check counter decrements
4. Kill Redis → upload still works (DB fallback)

**Workstream 3 (archive):**
1. Create COMPLETED job, set `finished_at` to 31 days ago in DB
2. Run `archive_old_jobs(30)` manually
3. Check row moved to `job_archive`, deleted from `background_jobs`

**Workstream 4 (org quotas):**
1. Insert org row with `max_queued_ingest_per_project=2`
2. Set user's `org_id` to that org
3. Upload 3 docs rapidly → 3rd should get 429
