# Agent instructions — RAGSuite backend (Server workspace)

AI agents working in **`/Users/arun/RAGSuite_Server`** should read before making changes:

1. Root [AGENTS.md](../AGENTS.md) — workspace isolation
2. [docs/ai/AI_PROJECT_MEMORY.md](docs/ai/AI_PROJECT_MEMORY.md)
3. [docs/ai/PROJECT_CONTEXT.md](docs/ai/PROJECT_CONTEXT.md)
4. Backend skill: [.cursor/skills/ragsuite-backend/SKILL.md](.cursor/skills/ragsuite-backend/SKILL.md)
5. Frontend (same workspace): [../frontend/](../frontend/) · root skill `.cursor/skills/ragsuite-server/SKILL.md`

---

## Workspace isolation (mandatory)

| Path | Role |
|------|------|
| **This workspace** | `/Users/arun/RAGSuite_Server` — consolidated server |
| Backend code | `/Users/arun/RAGSuite_Server/backend` |
| Frontend code | `/Users/arun/RAGSuite_Server/frontend` |
| **Do not touch** | `/Users/arun/RAGSuite_Server/backend` · `/Users/arun/RAGSuite_Server/frontend` |

All edits stay under `RAGSuite_Server`. Never modify the sibling legacy clones.

Rule: [`.cursor/rules/workspace-isolation.mdc`](.cursor/rules/workspace-isolation.mdc) and root `.cursor/rules/workspace-isolation.mdc`.

---

**Layout:** Backend package under `backend/` (`app/`, `alembic/`, `run.py`). Full stack boots from repo root via `npm start`.

**API:** `:9090` (Docker host) · container binds `:8000`. OAuth/SSO redirects use `FRONTEND_BASE_URL=http://localhost:9191`.

| Client | Path | Auth | Dev UI port |
|--------|------|------|-------------|
| Expo admin (this workspace) | `../frontend` | Bearer JWT | **`:9191`** (native Expo or Docker nginx) |

Auth accepts **Bearer or cookie**. Do not break either.

**Documents / embeddings:**

- Content preview / `content-stream` must be served from the **API host** (`:9090`), never the web UI origin.
- Do not call `MutableHeaders.pop()` — Starlette headers have no `.pop`.
- Item embedding coverage cache is short-lived; document lists should use `skip_cache=true` after ingest.

**Production note:** legacy `PROD_ROOT=/home/web/ragsuite_backend` is for the old deployment only — this Server tree uses Compose.
