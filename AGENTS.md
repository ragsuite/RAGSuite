# Agent instructions — RAGSuite Server

Primary workspace: **`/Users/arun/RAGSuite_Server`**.

## Read first

1. This file + [README.md](./README.md)
2. Backend: [backend/AGENTS.md](./backend/AGENTS.md) · skill `.cursor/skills/ragsuite-server/SKILL.md`
3. Frontend / brand: [frontend/AGENTS.md](./frontend/AGENTS.md)

## Hard isolation

| Path | Role |
|------|------|
| **`/Users/arun/RAGSuite_Server`** | This consolidated server — **only** place to edit |
| `/Users/arun/RAGSuite_backend` | Legacy sibling backend clone — **do not touch** |
| `/Users/arun/mobile-ragsuite` | Legacy sibling mobile clone — **do not touch** |

Never write, delete, or open those sibling trees for this project. Never merge their git histories into this folder.

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
