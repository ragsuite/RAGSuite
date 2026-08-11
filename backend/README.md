# RAGSuite API (Server workspace)

Python FastAPI backend for the RAGSuite multi-tenant RAG platform.  
Package path: **`backend/`** · frontend: **`../frontend`** in the same repo.

| Service | Port / value |
|---------|----------------|
| API (Docker host) | **9090** (`http://localhost:9090`) |
| API (container / host uvicorn) | **8000** |
| Chroma | internal `chromadb:8000` (host-local start.sh: **8004**) |
| Redis | **6382** |
| Postgres | **`ragsuite_v3`** on host **5436** |
| Web UI | **`http://localhost:9191`** |
| `FRONTEND_BASE_URL` | **`http://localhost:9191`** |

> **Isolation:** Do not edit sibling legacy clones. See root [AGENTS.md](../AGENTS.md).

---

## Architecture (current)

```text
┌────────────────────────────┐     Bearer JWT (+ cookie still OK)
│  frontend web (:9191)      │ ───────────────────────────────┐
│  Expo static / nginx       │                               │
└────────────────────────────┘                               ▼
                                                    ┌─────────────────┐
                                                    │ API :9090       │
                                                    │ FastAPI app/    │
                                                    └────────┬────────┘
           ┌──────────────────┬──────────────────────┼───────────────┐
           ▼                  ▼                      ▼               ▼
    PostgreSQL :5436        Redis :6382         Chroma internal  Worker
    (ragsuite_v3)           (sessions/cache)    (vectors)        (job_queue)
```

Prefer the **root** stack:

```bash
cp .env.example .env   # once, from repo root
npm start              # docker compose up --build
curl http://localhost:9090/api/v1/health/ping
```

OpenAPI: `http://localhost:9090/docs`

---

## Backend-only local (optional)

The full stack does **not** need a local `.venv` — Compose installs Python deps in the image.

For host-side pytest / `python run.py` only:

```bash
cd backend
bash scripts/setup.sh          # creates .venv when missing
source .venv/bin/activate
# Ensure root .env (symlinked as backend/.env) points at compose Postgres :5436
python run.py                  # API → :8000 (prefer compose for :9090 + web)
```

`backend/docker-compose.yml` is **deprecated** — use the root compose file.

---

## Pair with frontend (same workspace)

```bash
# Full stack (recommended, from repo root)
npm start

# Or native Expo Metro against running API:
cd frontend && yarn env:local && yarn start
```

| Auth mode | Client behavior |
|-----------|-----------------|
| Password | `POST /crawl/auth/login` → store `access_token` → `Authorization: Bearer …` |
| Google SSO | Full-page `/auth/sso/start` → callback to `:9191/login/callback` → hydrate Bearer |

Contract: [docs/backend/external-client-contract.md](docs/backend/external-client-contract.md)

---

## Features

- JWT auth (Bearer **or** cookie), 2FA, API keys, widget embed tokens
- Web crawl (Scrapy + Playwright), document upload/index, Gmail + five MCP connectors
- RAG search & chat, embeddings, reindex jobs
- Organization admin & Google OIDC SSO
- Analytics, audit, notifications, n8n hooks

## Tech stack

| Layer | Choice |
|-------|--------|
| Runtime | Python **3.14**, FastAPI, Uvicorn/Gunicorn |
| DB | PostgreSQL + Alembic |
| Vectors | ChromaDB |
| Cache / admission | Redis |
| Jobs | Postgres `background_jobs` + worker process |

## Project structure

```text
RAGSuite_Server/
├── backend/                 # THIS PACKAGE
│   ├── app/
│   ├── alembic/
│   ├── docs/
│   ├── scripts/
│   ├── run.py, start.sh
│   └── .env → ../.env       # symlink to root env
├── frontend/                # Expo admin
├── docker/                  # Backend + frontend Dockerfiles
└── docker-compose.yml       # Full stack
```

## Environment (high signal)

| Variable | Role |
|----------|------|
| `DATABASE_URL` | PostgreSQL (`ragsuite_v3` on `:5436` when using compose) |
| `JWT_SECRET_KEY` | Sessions / JWT |
| `CUSTOM_LLM_INTERNAL_API_KEY` | Internal LLM gateway |
| `SMTP_*`, `EMAIL_FROM` | Required — transactional email (invites, 2FA, password reset) |
| `FRONTEND_BASE_URL` | OAuth/SSO redirects → **:9191** |
| `CORS_ORIGINS` | Must include `http://localhost:9191` |
| `SSO_ENABLED` | Global Google SSO gate |

Root `.env` / `.env.example` are authoritative. Public self-registration is disabled; bootstrap the first admin with `python -m app.cli bootstrap-org-admin`.

## Agent / docs entrypoints

| Doc | Use |
|-----|-----|
| Root [AGENTS.md](../AGENTS.md) | Workspace isolation |
| [AGENTS.md](./AGENTS.md) | Backend-specific |
| [docs/ai/AI_PROJECT_MEMORY.md](docs/ai/AI_PROJECT_MEMORY.md) | Compact orientation |
| `.cursor/skills/ragsuite-backend` | Backend implementation skill |

## Troubleshooting

| Symptom | Check |
|---------|-------|
| SSO stuck / “Not authenticated” | `FRONTEND_BASE_URL=http://localhost:9191`; CORS; Bearer hydrate |
| Document preview Unmatched Route | Preview URLs must use API origin (`:9090`), not web UI |
| Wrong stack | Ensure you are in `RAGSuite_Server`, not the sibling clones |
| Port conflict | This project uses **9090/9191/5436/6382** — siblings use 8002/8081/5435/6380 |

## License

Copyright 2026 NITSAN

Licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE).
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/NOTICE) for attribution and Community Edition scope.
