# Agent instructions — RAGSuite backend (CE monorepo)

AI agents working in **`/Users/arun/RAGSUITE`** should read before making backend changes:

1. Root [AGENTS.md](../AGENTS.md) — workspace isolation
2. [docs/ai/AI_PROJECT_MEMORY.md](docs/ai/AI_PROJECT_MEMORY.md)
3. [docs/ai/PROJECT_CONTEXT.md](docs/ai/PROJECT_CONTEXT.md)
4. Root skill: `../.cursor/skills/ragsuite-server/SKILL.md`
5. Live ops: [../docs/operations/multi-tenant-docker-ops.md](../docs/operations/multi-tenant-docker-ops.md)
6. Frontend (same workspace): [../frontend/](../frontend/) · brand [../frontend/AGENTS.md](../frontend/AGENTS.md)

---

## Workspace isolation (mandatory)

| Path | Role |
|------|------|
| **This workspace** | `/Users/arun/RAGSUITE` — CE monorepo |
| Backend code | `/Users/arun/RAGSUITE/backend` |
| Frontend code | `/Users/arun/RAGSUITE/frontend` |
| **Do not touch** | `/Users/arun/RAGSuite_backend` · `/Users/arun/mobile-ragsuite` |

All product edits stay under `/Users/arun/RAGSUITE`. Never modify the sibling legacy clones.

Rule: [`.cursor/rules/workspace-isolation.mdc`](../.cursor/rules/workspace-isolation.mdc).

---

**Layout:** Backend package under `backend/` (`app/`, `alembic/`, `run.py`). Full stack boots from repo root via `npm start`.

**API:** `:9090` (host) · container often binds `:8000`. OAuth/SSO redirects use `FRONTEND_BASE_URL=http://localhost:9191`.

| Client | Path | Auth | Dev UI port |
|--------|------|------|-------------|
| Expo admin (this workspace) | `../frontend` | Bearer JWT | **`:9191`** (native Expo or Docker nginx) |

Auth accepts **Bearer or cookie**. Do not break either.

**Documents / embeddings:**

- Content preview / `content-stream` must be served from the **API host** (`:9090`), never the web UI origin.
- Do not call `MutableHeaders.pop()` — Starlette headers have no `.pop`.
- Item embedding coverage cache is short-lived; document lists should use `skip_cache=true` after ingest.
- **`GET /crawl/sites` must stay fast:** tiny candidate sets use per-item Chroma probes (never full multi‑GB metadata scans). List enrichment is fail-soft (~8s) so Postgres sources still return when Chroma is slow.

**Crawl / embedding UX (shipped):** coverage-first Edit radio; model-aware Start Crawl confirm; Stop Crawl; no Chroma purge on Update; indexed labels from actual collections; same chat/search model+collection keeps Edit “already indexed” info.

**Production / multi-tenant:** Compose stacks (e.g. HEH/BGE on keeen). Never `down -v`. See [multi-tenant-docker-ops.md](../docs/operations/multi-tenant-docker-ops.md).
