# Agent instructions — RAGSuite Community (CE)

Primary workspace: **`/Users/arun/RAGSUITE`**.

## Read first

1. This file + [README.md](./README.md)
2. Backend: [backend/AGENTS.md](./backend/AGENTS.md) · [backend/docs/ai/AI_PROJECT_MEMORY.md](./backend/docs/ai/AI_PROJECT_MEMORY.md) · skill `.cursor/skills/ragsuite-server/SKILL.md`
3. Frontend / brand: [frontend/AGENTS.md](./frontend/AGENTS.md)
4. Live multi-tenant Docker (HEH/BGE): [docs/operations/multi-tenant-docker-ops.md](./docs/operations/multi-tenant-docker-ops.md)
5. CE/EE edition work: `.cursor/skills/ragsuite-ce-ee/SKILL.md`

## Hard isolation

| Path | Role |
|------|------|
| **`/Users/arun/RAGSUITE`** | This CE monorepo — **only** place to edit for product work |
| `/Users/arun/RAGSUITE_EE` | Private EE modules (separate tree) |
| `/Users/arun/RAGSUITE_License` | License server (separate tree) |
| `/Users/arun/RAGSuite_backend` | Legacy sibling — **do not touch** |
| `/Users/arun/mobile-ragsuite` | Legacy sibling — **do not touch** |

Do not prefer the legacy path name `/Users/arun/RAGSuite_Server`. Never merge sibling git histories into this folder.

## Ports (this project)

| Service | Port |
|---------|------|
| API | **9090** |
| Web UI (native / Expo) | **9191** |
| Web UI (Docker nginx) | **9191** |
| Postgres | **5436** (`ragsuite_v3`) |
| Redis | **6382** |
| Chroma (native) | **8004** |

Avoid `8000`/`8001`/`8002`/`8003`/`5435`/`6380`/`8081` — sibling stacks.

## Single command

```bash
npm start              # Native: API :9090 + Expo web :9191 (default deploy — no Docker)
npm run stop           # Stop host processes only (never wipes data)
npm run start:docker   # Optional maintainer Docker stack
```

## Owners

- Backend work → `backend/`
- Frontend work → `frontend/`
- Compose / ports / shared env → repo root
- Multi-tenant live ops (keeen HEH/BGE) → [docs/operations/multi-tenant-docker-ops.md](./docs/operations/multi-tenant-docker-ops.md)
