# AI Project Memory

> **Read this first.** Short, high-signal context for AI agents. Full report: [AI_PROJECT_CONTEXT_REPORT.md](./AI_PROJECT_CONTEXT_REPORT.md).

**Last updated:** 2026-07-15  
**Human source of truth:** [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)  
**Legacy monorepo reference:** `/Users/arun/Desktop/RAGSUITE` — Vite admin SPA (optional)  
**Target frontend:** `/Users/arun/RAGSuite_Server/frontend` — Expo admin (**web `:9091`**) — **separate workspace/git**

---

## What This Repo Is

**RAGSuite standalone backend** — the multi-tenant RAG API extracted to its own repository. App code lives at **repo root** (`app/`, `alembic/`, `run.py`), not `backend/`.

**Product:** crawl websites, upload documents, sync Gmail/ClickUp/Google Drive/Notion/Confluence/SharePoint/Slack, index into ChromaDB, serve **AI chat**, **semantic search**, and **embeddable widgets**.

**Admin UI:** Target is **frontend (Server workspace)** (Bearer on Expo web `:9091`). Legacy Vite SPA remains cookie-compatible. Backend keeps dual session support. Compatibility: [docs/frontend/README.md](../frontend/README.md).

**Workspace rule:** Never merge `RAGSuite_Server/backend` and `frontend (Server workspace)` into one Cursor multi-root / one git tree. **If a task needs backend file A + frontend file B:** edit both via absolute paths in the same turn — do not merge workspaces/git to accomplish that. See `.cursor/rules/workspace-isolation.mdc`.

---

## Standalone vs Monorepo vs Target UI

| Topic | This repo (`RAGSuite_Server/backend`) | Monorepo (`/Users/arun/Desktop/RAGSUITE`) | Target UI (`frontend (Server workspace)`) |
|-------|-------------------------------|-------------------------------------------|-------------------------------|
| Layout | `app/` at repo root | `backend/app/` + `frontend/` | Expo `src/` client only |
| API port | **9090** | **8000** | Calls this API (`API_URL` → origin `:9090`) |
| Frontend | External | Vite SPA `:5173` (cookie) | Expo web **`:9091`** (Bearer) |
| `FRONTEND_BASE_URL` | **`http://localhost:9091`** | Often `:5173` | Must match Expo web for SSO |
| Chroma | **8004** (host) / internal compose | **8001** or 8003 | — |
| Redis | **6382** | **6379** | — |
| Postgres DB | **`ragsuite_v3`** | **`rag_suite`** | — |
| Git / Cursor | Separate git A; may edit absolute paths in B without merging | Separate | Separate git B |

**Intent unchanged:** same API, auth, jobs, connectors. Dual auth (cookie **or** Bearer) must not break.

---

## Stack at a Glance

- **Backend:** Python 3.14, FastAPI, SQLAlchemy, Alembic — `app/`
- **Database:** PostgreSQL (`ragsuite_v3`)
- **Vector:** ChromaDB (`CHROMA_MODE=local|http`, port **8004** (host) / internal compose)
- **Queue/cache:** Postgres `background_jobs`, Redis **6382**
- **Auth:** JWT + `UserSession` (**cookie or Bearer**); widgets use `X-Project-ID` + embed token
- **Org:** One org per deployment; bootstrap admin → invite-only; Google OIDC SSO
- **Deploy:** Docker Compose and/or supervisord
- **Frontend (external):** frontend (Server workspace) `:9091`; legacy Vite optional; **not bundled** here

---

## Structure

```text
RAGSuite_Server/backend/           # THIS REPO / THIS WORKSPACE
├── app/routes/
├── app/services/
├── alembic/
├── docs/backend/
├── docs/frontend/            # Compat with frontend (Server workspace) (docs only)
├── docs/ai/
├── .cursor/skills/
├── .cursor/rules/
├── .cursorignore             # Defensive: ignore accidental nested UIs
├── .env
├── run.py                    # → :9090
├── start.sh
└── docker-compose.yml

# NOT in this git tree — open separately
/Users/arun/RAGSuite_Server/frontend/                 # Expo :9091
/Users/arun/Desktop/RAGSUITE/frontend/       # Legacy Vite
```

---

## Running the backend

| Mode | Command | What runs |
|------|---------|-----------|
| API only | `source .venv/bin/activate && python run.py` | API :9090 |
| Full local | `./start.sh` | Redis :6382 → Chroma :8004 → worker → API :9090 |
| Docker | `docker compose up --build` | Postgres :5436, Redis, Chroma, API, worker |

**Pair UI:** In **frontend (Server workspace)** workspace: `API_URL=http://localhost:9090`, web on **`:9091`**, backend `FRONTEND_BASE_URL=http://localhost:9091`.

---

## Critical Decisions

- **Project-scoped data** + per-project Chroma collections.
- **Auth path:** `/api/v1/crawl/auth/*` — NOT `/api/v1/auth/*` (SSO is `/api/v1/auth/sso/*`).
- **Admin clients:** Legacy = cookies; mobile = Bearer; API accepts both.
- **Connectors:** `CONNECTOR_SYNC` → `DOCUMENT_INGEST` per file.
- **Document preview:** Always API base `:9090` for `/content` / `/content-stream` (never Expo origin).
- **Coverage cache:** Short TTL; use `skip_cache` after ingest; API/worker caches are separate processes.
- **Shipped:** Org admin APIs, Google SSO, hierarchical project permissions (mobile wired), five connectors + Gmail.

---

## Conventions (Easy to Violate)

- New routes → `schemas.py` + `main.py` + `docs/backend/api-reference.md`
- Paths: `app/` not `backend/app/`
- API JSON **snake_case**; clients map to camelCase
- Do **not** modify Gmail/ClickUp when adding MCP connectors (framework connectors are separate)
- Required env: `DATABASE_URL`, `JWT_SECRET_KEY`, `CUSTOM_LLM_INTERNAL_API_KEY`
- `.env` at **repo root**

---

## Common Pitfalls

- Using `/auth/login` instead of `/crawl/auth/login`
- Assuming `FRONTEND_BASE_URL` is still `:9091` — target Expo web is **`:9091`**
- Preview / content-stream pointed at `localhost:9091` → Unmatched Route
- `MutableHeaders.pop` in middleware → 500 on content-stream
- Embedding model “None” for ~cache TTL after ingest — use `skip_cache=true`
- Merging Backend + mobile into one Cursor/git workspace → confused diffs/commits
- Skipping the frontend half of a dual-repo task “because workspace is backend-only” — wrong; edit `/Users/arun/RAGSuite_Server/frontend/...` absolutely instead
- Monorepo ports (8000/5173/6379/8001) — this repo uses **8002 / 8081 / 6380 / 8003**
- `WEB_CONCURRENCY>1` with `CHROMA_MODE=local` → startup failure
- `ALLOW_PUBLIC_REGISTRATION` / `SSO_ENABLED` mis-set in `.env`

---

## Active Development

- **Shipped:** Org + Google SSO API; mobile Team/permissions + SSO Bearer hydrate; document preview/reindex/Gmail MIME + coverage freshness fixes
- **Remaining client gaps:** `public-config` consumption; Confluence/SharePoint/Slack crawl panels — [COMPATIBILITY_GAPS.md](../frontend/COMPATIBILITY_GAPS.md)
- **Backend planned:** SAML/SCIM — `docs/planned/`
- **Smoke:** `scripts/smoke_connectors.py`, `scripts/smoke_org_sso.py`

---

## When Touching X, Also Check Y

| If you change... | Also verify... |
|------------------|----------------|
| `models.py` | Alembic, `schemas.py`, API responses |
| `auth.py` | crawl auth, widget `get_project_id_or_user`, SSO callback contract |
| `job_queue.py` | scheduler, ingest caps, REINDEX defer on 429 |
| `documents.py` / content-stream | middleware CSP (no `.pop`), media-type normalize |
| `reindex_service.py` | coverage cache invalidate, staging byte recovery |
| New connector | `framework.py`, job handler, scheduler — not Gmail/ClickUp |
| Frontend-facing contract | `docs/frontend/*`, `external-client-contract.md` (**docs only in this repo**) |

---

## Verification Checklist

```bash
bash scripts/setup.sh
alembic upgrade head
./start.sh
pytest tests/ -q
curl http://localhost:9090/api/v1/health/ping
```

- [ ] Tests pass · no unrelated files · API docs if routes changed · contract docs if client-facing

---

## Quick Links

- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- [README.md](../../README.md)
- [docs/frontend/README.md](../frontend/README.md)
- [organization-and-sso.md](../backend/organization-and-sso.md)
- [Backend skill](../../.cursor/skills/ragsuite-backend/SKILL.md) · [Frontend skill](../../.cursor/skills/ragsuite-frontend/SKILL.md)
