# RAGSuite — AI Project Context Recovery Prompt

You are joining **RAGSuite standalone backend** — the API/worker half of the full RAGSuite platform. Your job is to **reconstruct project context** and maintain artifacts before making code changes:

- `docs/ai/AI_PROJECT_CONTEXT_REPORT.md` — detailed, evidence-cited analysis
- `docs/ai/AI_PROJECT_MEMORY.md` — compact memory for future AI sessions

Your first task is **context reconstruction, not implementation**.

**Full-stack reference:** `/Users/arun/Desktop/RAGSUITE` (monorepo with `backend/app/` + legacy `frontend/`).  
**Target admin UI:** `/Users/arun/RAGSuite_Server/frontend`. Compatibility bridge: `docs/frontend/`. Same product API; this repo has `app/` at root and isolated dev ports.

---

## Non-Negotiable Rules

- **Do not modify source code** until both artifacts are current and the user explicitly approves implementation.
- **Prefer evidence over inference.** Label inferences as **Assumption** with rationale.
- **Cite evidence** (file path; line refs when available).
- **Do not ask many questions up front.** Batch 1–2 critical questions only when blocked.
- **Read project docs first** — see [Context Sources](#context-sources) below.

---

## Context Sources (read in order)

| Priority | Path | Purpose |
|----------|------|---------|
| 1 | `docs/ai/AI_PROJECT_MEMORY.md` | Fast orientation (standalone layout) |
| 2 | `docs/ai/PROJECT_CONTEXT.md` | Human-maintained truth |
| 3 | `docs/ai/AI_PROJECT_CONTEXT_REPORT.md` | Full evidence report |
| 4 | `docs/backend/README.md` + `api-reference.md` | Backend APIs |
| 5 | `docs/backend/external-client-contract.md` | External client API contract |
| 5b | **`docs/frontend/README.md`** | Legacy SPA vs **frontend (Server workspace)** compat |
| 6 | `docs/planned/README.md` | Product roadmap (SAML/SCIM) |
| 6b | **`docs/backend/organization-and-sso.md`** | **Org + Google SSO (shipped)** |
| 7 | `README.md` | Setup, env, ports, Docker |
| 8 | `.cursor/skills/ragsuite-backend/SKILL.md` | Backend agent conventions |
| 8b | `.cursor/skills/ragsuite-frontend/SKILL.md` | Target frontend orientation |
| 9 | Monorepo / mobile paths above | Cross-repo context when needed |

---

## Phase 0: Ground Truth (this repo)

Document:

- **Repo root:** `/Users/arun/Documents/RAGSuite_Server/backend` (or clone path)
- **Layout:** `app/` at repo root — **not** `backend/app/`
- **Backend:** Python 3.14, FastAPI, `run.py` → port **9090**
- **External clients:** not in repo — use `FRONTEND_BASE_URL` in `.env` for OAuth redirects (`http://localhost:9091` for frontend (Server workspace) Expo web; legacy Vite used `:9091`)
- **DB:** PostgreSQL `ragsuite_v3` + Alembic (`alembic/`)
- **Vector:** ChromaDB HTTP port **8004** (host) / internal compose
- **Redis:** port **6382**
- **Queue:** Postgres `background_jobs` + `python -m app.worker`
- **Install:** `bash scripts/setup.sh` or `./start.sh` or `docs/operations/development.md`
- **Tests:** `pytest tests/`

### Frontend-optional behavior

- `./start.sh` runs backend stack only (Redis, Chroma, worker, API)
- Backend is fully testable via OpenAPI `/docs`, curl, pytest, smoke scripts
- Widget clients use same API with `X-Project-ID` headers (see backend-contract)

---

## Phase 1–6: Standard Analysis

1. Discover context sources (this repo + monorepo reference)
2. Analyze project structure (`app/` layout vs monorepo `backend/app/`)
3. Recover historical context (`git log`)
4. Identify WIP (`docs/planned/`, `docs/backend/future/`, org milestone)
5. Infer engineering conventions
6. Risk analysis (auth, migrations, Chroma locks, job queue)

---

## Stack Add-ons

### Python / FastAPI

- `app/main.py` — router registration, lifespan guards
- `app/models.py`, `schemas.py`, `settings.py`
- `app/routes/` — ~30 route modules; **auth at `/api/v1/crawl/auth/*`**
- `app/services/job_queue.py` — background jobs
- `.env.example` — required: `DATABASE_URL`, `JWT_SECRET_KEY`, `CUSTOM_LLM_INTERNAL_API_KEY`
- Migrations: `alembic upgrade head` from repo root

### External React / Vite (monorepo or sibling)

- `frontend/client/src/services/api/` — authoritative API layer
- Cookie session auth (`withCredentials: true`)
- Widgets: UMD builds, `X-Project-ID` headers
- Point API at `http://localhost:9090/api/v1` when using this standalone backend

### Planned (backend first — no frontend until APIs exist)

| Feature | Product doc | Backend spec |
|---------|-------------|--------------|
| Organization + Google SSO | `docs/backend/organization-and-sso.md` | `docs/backend/api-reference.md` |
| SAML / SCIM | `docs/planned/sso.md` | `docs/backend/future/sso.md` (archived OIDC spec) |
| Connectors | `docs/connectors/README.md` | `docs/backend/future/connectors.md` |

**Next milestone:** Organization architecture.

---

## Phase 7: Artifacts

Refresh when architecture or conventions change:

- `docs/ai/AI_PROJECT_CONTEXT_REPORT.md`
- `docs/ai/AI_PROJECT_MEMORY.md`

Update `docs/ai/PROJECT_CONTEXT.md` when humans change stack, workflow, or active focus.

Log doc changes in `docs/ai/CHANGELOG.md`.

---

## Phase 8: Completion Gate

Before implementation:

1. Confirm artifacts exist and are current.
2. Provide 5–10 bullet "What I now know" summary.
3. List top 3 uncertainties.
4. Ask: **"Proceed to implementation?"**

---

## Evidence Citation Format

```text
[Fact] Auth routes live under /api/v1/crawl/auth/*.
Evidence: app/routes/crawl.py, docs/backend/api-reference.md
```

```text
[Fact] Standalone repo uses API port 9090.
Evidence: README.md, run.py, docker-compose.yml
```

```text
[Assumption] Monorepo improvements branch has unreleased work.
Rationale: git branch exists at /Users/arun/Desktop/RAGSUITE; verify before citing as shipped.
```
