# Agent instructions — RAGSuite backend (CE monorepo)

AI agents working in **`/path/to/RAGSUITE`** should read before making backend changes:

1. Root [AGENTS.md](../AGENTS.md) — workspace isolation
2. [docs/ai/AI_PROJECT_MEMORY.md](docs/ai/AI_PROJECT_MEMORY.md)
3. [docs/ai/PROJECT_CONTEXT.md](docs/ai/PROJECT_CONTEXT.md)
4. Root skill: `../.cursor/skills/ragsuite-server/SKILL.md`
5. Multi-tenant Docker deployments: [docs/operations/server-onboarding.md](docs/operations/server-onboarding.md) · [../docs/architecture/WIDGET_EMBED_OPS.md](../docs/architecture/WIDGET_EMBED_OPS.md)
6. Frontend (same workspace): [../frontend/](../frontend/) · brand [../frontend/AGENTS.md](../frontend/AGENTS.md)

---

## Workspace isolation (mandatory)

| Path | Role |
|------|------|
| **This workspace** | `/path/to/RAGSUITE` — CE monorepo |
| Backend code | `/path/to/RAGSUITE/backend` |
| Frontend code | `/path/to/RAGSUITE/frontend` |
| **Do not touch** | `/path/to/legacy-backend-clone` · `/path/to/legacy-mobile-clone` |

All product edits stay under `/path/to/RAGSUITE`. Never modify the sibling legacy clones.

Rule: [`.cursor/rules/workspace-isolation.mdc`](../.cursor/rules/workspace-isolation.mdc).

---

## Product glossary (use these names in comments, logs, prompts, docs)

| Product name | Code / module | Notes |
|--------------|---------------|-------|
| **Admin Assistant** | `modules/ai_assistant` · `/api/v1/ai-assistant` · `ai_assistant_*` tables · `ai_assistant:*` permissions | In-app operator helper for dashboard users. Never call it the chatbot. |
| **AI Chatbot** | `widgets` module (Chatbot Widget config, `ChatbotSettings`) · `chat` module · `app/routes/chatbot.py` · chat endpoints in `app/routes/rag.py` | The embeddable chatbot for end users. Never call it "AI assistant". |
| **Search Widget** | `search` + `widgets` modules (`SearchSettings`) | Embeddable AI search; separate from the chatbot. |
| **AI Voice Pilot** | `modules/ai_voice_pilot` (Community) · `voice_pilot:*` permissions · `VoicePilotSettings` | Separate voice module; `widget_voice_pilot_*` only controls its tab inside the chatbot. Mic/speaker widget controls are the `modules/voice` Community module. |

Legacy identifiers (`ai_assistant`, `AIAssistant*`, `ai-assistant`, `profile_type="ai_assistant"`) are stable DB/API contracts — do **not** rename them; change wording only. The LLM message role `"assistant"` (and `assistant_response`, `{"type": "assistant"}`) is a technical role, not a product name.

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

**Production / multi-tenant:** Compose stacks (one per tenant on a shared host). Never `down -v`. See [server-onboarding.md](docs/operations/server-onboarding.md) and [WIDGET_EMBED_OPS.md](../docs/architecture/WIDGET_EMBED_OPS.md).
