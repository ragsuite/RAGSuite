# PROJECT_CONTEXT.md

> **Human-maintained source of truth** for RAGSuite **standalone backend**. AI agents: read [AI_PROJECT_MEMORY.md](./AI_PROJECT_MEMORY.md) first, then this file.

**Last updated:** 2026-07-15

## Overview

| Field | Value |
| ----- | ----- |
| Project name | RAGSuite API (standalone backend) |
| Domain | Multi-tenant RAG / AI knowledge platform |
| Target users | Orgs building AI chat, search, widgets over their content |
| Repository | `RAGSuite_Server/backend` (extracted from full-stack `RAGSUITE` monorepo) |
| Monorepo reference | `/Users/arun/Desktop/RAGSUITE` (legacy Vite frontend) — **separate** |
| Target frontend | `/Users/arun/RAGSuite_Server/frontend` (Expo web **`:9091`**) — **separate git + Cursor workspace** |
| Primary stack | FastAPI + PostgreSQL + ChromaDB + Redis (no frontend in this repo) |
| Production path | `PROD_ROOT=/home/web/ragsuite_backend` |

### Purpose

**This repo ships the API and background workers only.** External clients use [docs/backend/external-client-contract.md](../backend/external-client-contract.md).

**Frontend migration:** Operators use **frontend (Server workspace)** as the primary admin UI. Org Team/permissions and Google SSO are largely wired on the client; remaining gaps are listed in [docs/frontend/COMPATIBILITY_GAPS.md](../frontend/COMPATIBILITY_GAPS.md).

**Workspace policy:** Do not merge this backend with `frontend (Server workspace)` (or the legacy monorepo) into one Cursor multi-root workspace or one git repository. **Cross-repo tasks:** when asked to change backend + frontend files, edit both via absolute paths in the same task; keep commits and git roots separate. Agent rule: `.cursor/rules/workspace-isolation.mdc`.

## Technology Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Python 3.14, FastAPI, SQLAlchemy, Alembic — `app/` at repo root |
| Frontend | **External** — `/Users/arun/RAGSuite_Server/frontend` (`:9091`); legacy `/Users/arun/Desktop/RAGSUITE/frontend` |
| Database | PostgreSQL (`ragsuite_v3`; Docker host **5436**, local **5433**) |
| Vector | ChromaDB HTTP sidecar, port **8004** (host) / internal compose |
| Cache / Queue | Redis port **6382**; Postgres `background_jobs` |
| Auth | JWT + UserSession (**Bearer or cookie**); 2FA; API keys; widget embed tokens |
| Hosting | Docker Compose; supervisord (Gunicorn + worker) in production |

### Dev ports (this product stack)

| Service | Port |
| --------|------|
| API | **9090** |
| Chroma | **8004** (host) / internal compose |
| **Target Expo web (frontend (Server workspace))** | **9091** |
| `FRONTEND_BASE_URL` | **`http://localhost:9091`** |
| Redis | **6382** |
| Postgres (Docker) | **5436** |
| Postgres (local Homebrew) | **5433** typical |

Legacy/monorepo ports to avoid confusing with this stack: API 8000, Chroma 8001, Redis 6379, Vite 5173/5175.

## Architecture

See [docs/architecture.md](../architecture.md) and root [README.md](../../README.md).

### Major Modules

| Module / Directory | Responsibility |
| ------------------ | -------------- |
| `app/routes/` | REST API (~30 modules) |
| `app/services/rag/` | Retrieve, embed, generate |
| `app/services/job_queue.py` | Crawl, ingest, reindex, connector sync |
| `app/services/reindex_service.py` | Reindex + item embedding coverage cache |
| `app/services/connectors/` | Drive, Notion, Confluence, SharePoint, Slack |
| `docs/backend/` | Authoritative backend documentation |
| `docs/frontend/` | Legacy vs frontend (Server workspace) compatibility |
| `docs/planned/` | Product roadmap (SAML/SCIM, etc.) |

### External Integrations

| Service | Purpose | Config |
| ------- | ------- | ------ |
| OpenAI, Mistral, Anthropic, Gemini, Ollama | LLM + embeddings | Per-project settings |
| Gmail, ClickUp | Legacy ingest | `/api/v1/gmail`, `/api/v1/clickup` |
| Drive, Notion, Confluence, SharePoint, Slack | Connector framework | `/api/v1/connectors/{type}/*` |
| n8n | Workflow automation | `/api/v1/n8n` |
| SMTP | Email verify, 2FA, invites | `.env` at repo root |

## External clients

| Client | Path | Session | UI port | Notes |
|--------|------|---------|---------|-------|
| **Target** frontend (Server workspace) | `/Users/arun/RAGSuite_Server/frontend` | Bearer JWT | **9091** | `API_URL` → `http://localhost:9090` |
| Legacy Vite SPA | `/Users/arun/Desktop/RAGSUITE/frontend` | Cookie | 5173/5175 | Historical core compat |

Set `FRONTEND_BASE_URL=http://localhost:9091` for SSO/OAuth callbacks owned by Expo web.

## Data Model

Key entities: `User`, `Organization`, `Project`, `CrawlSource`, `UploadedDocument`, `ChatMessage`, `ConnectorIntegration`, `BackgroundJob`, `ReindexJob`.

Org model: **one organization per deployment**; bootstrap first org admin, then invite-only (`ALLOW_PUBLIC_REGISTRATION=false`).

Migrations: `alembic upgrade head` (repo root)

## API and Interfaces

- **REST:** `/api/v1/*` — [api-reference.md](../backend/api-reference.md)
- **Auth:** `/crawl/auth/*` · **SSO:** `/auth/sso/*` · **Org:** `/org/*`
- **Documents:** list/upload/content/content-stream/chunks; preview must hit API host
- **Jobs:** `CONNECTOR_SYNC`, `DOCUMENT_INGEST`, `CRAWL`, `REINDEX`, `GMAIL_SYNC`, …

## Development Workflow

```bash
bash scripts/setup.sh
alembic upgrade head
./start.sh                    # API :9090 + worker + Redis + Chroma
```

With UI (separate workspace):

```bash
# Backend .env
FRONTEND_BASE_URL=http://localhost:9091

# frontend (Server workspace) workspace
yarn env:local && yarn web    # :9091
```

### Pull Request Requirements

- Tests pass (`pytest`)
- Migrations for schema changes
- Backend API docs for new routes
- No secrets; no accidental frontend tree commits

## Engineering Conventions

- Backend: snake_case · clients map to camelCase
- Logic in `services/`, thin routes · schemas in `app/schemas.py`
- Connector pattern: framework + per-platform service + router
- Tests: `tests/` · `pytest tests/ -q`

## Active Development

### Shipped

| Area | Status | Notes |
|------|--------|-------|
| Org admin APIs | ✅ | [organization-and-sso.md](../backend/organization-and-sso.md) |
| Google OIDC SSO | ✅ | Callback + mobile Bearer hydrate (hash) |
| Hierarchical project permissions | ✅ API + mobile Team UI | Independent module toggles |
| Five connectors + Gmail | ✅ API | Mobile: Drive + Notion + Gmail (+ domain/docs) |
| Document preview / reindex hygiene | ✅ | content-stream CSP; coverage `skip_cache`; staging recovery |

### Next

1. Remaining mobile gaps — `public-config`, Confluence/SharePoint/Slack panels — [COMPATIBILITY_PLAN.md](../frontend/COMPATIBILITY_PLAN.md)
2. SAML / SCIM — [planned/sso.md](../planned/sso.md)
3. Broader ACL remaining on some route modules

### Known Technical Debt

- Global `is_admin` coexists with `organization_members.role`
- ACL not uniform on every module
- `GET /analytics/project/{id}` lacks auth
- Some older docs may still mention `:9091` — prefer `:9091` for target UI

## Risks and Sensitive Areas

| Area | Risk | Extra verification |
| ---- | ---- | ------------------ |
| Auth / sessions / SSO | Account takeover / cookie vs Bearer mismatch | Callback + CORS + `FRONTEND_BASE_URL` |
| Migrations | Data loss | Staging upgrade + backup |
| Chroma locks | Corruption | `CHROMA_MODE`, workers |
| Job queue / reindex | Starvation, stuck `running`, 429 mishandling | Idempotency, defer on rate limit |
| Workspace merge | Wrong-repo commits | Isolation rule + `.cursorignore` |
| Dual-repo task | Doing only half the work / merging trees | Absolute-path edits in both clones; separate git commits |

## Important Decisions

| Date | Decision | Rationale |
| ---- | -------- | --------- |
| 2026 | Standalone backend repo | Deploy API independently |
| 2026 | Isolated ports (8002/6380/8003) | No clash with monorepo |
| 2026-07 | Target Expo web **:9091** for `FRONTEND_BASE_URL` | Matches frontend (Server workspace) `yarn web` |
| 2026-07 | Keep backend ↔ mobile as **separate workspaces** | Avoids merged git/Cursor conflicts |
| 2026 | Dual admin clients (cookie + Bearer) | Migrate UI without API fork |
| 2026 | Postgres job queue | SKIP LOCKED claiming |

## Changelog (manual)

| Date | Change |
| ---- | ------ |
| 2026-07-15 | Context sync: Expo `:9091`, SSO/org mobile progress, docs/preview/reindex notes, workspace isolation |
| 2026-07-08 | Frontend compat docs + frontend skill |
| 2026-07-07 | Org + Google SSO backend shipped |
| 2026-07-03 | AI onboarding docs |
