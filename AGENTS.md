# Agent instructions — RAGSuite Community (CE)

Primary workspace: this repository (`RAGSuite`). Platform version: **1.0.8**.

## Read first

1. This file + [README.md](./README.md)
2. Backend: [backend/AGENTS.md](./backend/AGENTS.md)
3. Frontend / brand: [frontend/AGENTS.md](./frontend/AGENTS.md)
4. Multi-tenant Docker deployments: [backend/docs/operations/server-onboarding.md](./backend/docs/operations/server-onboarding.md)
5. Architecture index: [docs/architecture/README.md](./docs/architecture/README.md) · edition matrix: [docs/architecture/FEATURE-MATRIX.md](./docs/architecture/FEATURE-MATRIX.md)
6. Cursor rules: [`.cursor/rules/`](./.cursor/rules/) (workspace isolation, backend, frontend)

## Hard isolation

| Path | Role |
|------|------|
| **This repo (`RAGSuite`)** | CE monorepo — **only** place to edit for Community product work |
| Sibling `RAGSuite-EE` (or `RAGSUITE_EE`) | Private EE modules — edit only for Enterprise modules |
| Sibling `License-Server` (or `RAGSUITE_License`) | License server — separate product |
| Legacy sibling clones | **Do not touch** |

Do not use the legacy workspace name `RAGSuite_Server`. Never merge sibling git histories into this folder.

## Ports (this project)

| Service | Port |
|---------|------|
| API | **9090** |
| Web UI (native / Expo / Docker nginx) | **9191** |
| Postgres | **5436** (`ragsuite_v3`) |
| Redis | **6382** |
| Elasticsearch | **9210** |
| MinIO | **9010** / **9011** |

Avoid `8000`/`8001`/`8002`/`8003`/`5435`/`6380`/`8081` — sibling stacks. Prefer **9191** over legacy **9091** for the web UI.

## Single command

```bash
npm start              # Native: API :9090 + Expo web :9191; compose data services if needed
npm run stop           # Stop host processes only (never wipes data)
npm run start:docker   # Docker stack (same as: docker compose up -d --build)
npm run test:ci        # Backend tests + frontend check
docker compose up -d --build   # Same volumes as npm run start:docker (1 replica unless --scale)
```

With EE attached for DX: place `RAGSuite-EE` as a sibling (auto-attach) or set `RAGSUITE_EE_ROOT`.

## Layout

| Path | Role |
|------|------|
| `backend/` | FastAPI Platform + Shared (`app/`, `alembic/`, tests) |
| `frontend/` | Expo admin dashboard |
| `modules/` | Community modules (manifest + `backend/register.py`) |
| `extensions/` | Optional install root (EE bundle unpack target) |
| `cli/` | Published `@ragsuite/ragsuite` CLI |
| `docs/architecture/` | ADRs, feature matrix, release notes |

## Community modules (on disk)

`ai_assistant`, `ai_voice_pilot`, `audit_basic`, `auth_2fa_sessions`, `auth_password`, `chat`, `citations`, `connectors`, `crawl`, `data_compliance`, `documents`, `feedback`, `llm_providers`, `mcp`, `model_configuration`, `notifications`, `projects`, `search`, `system_health`, `trust_center`, `voice`, `widgets`

Voice and AI Voice Pilot are **Community** — no license required. See [FEATURE-MATRIX.md](./docs/architecture/FEATURE-MATRIX.md).

## Owners

- Backend work → `backend/` (+ module backends under `modules/<id>/backend/`)
- Frontend work → `frontend/` (+ `frontend/src/modules/<id>/` when migrated)
- Compose / ports / shared env → repo root
- Multi-tenant Docker deployments → [server-onboarding.md](./backend/docs/operations/server-onboarding.md)
