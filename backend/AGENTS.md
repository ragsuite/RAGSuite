# Agent instructions — RAGSuite backend (CE monorepo)

AI agents working in this CE monorepo should read before making backend changes:

1. Root [AGENTS.md](../AGENTS.md) — workspace isolation
2. Architecture: [../docs/architecture/README.md](../docs/architecture/README.md)
3. Multi-tenant Docker: [docs/operations/server-onboarding.md](docs/operations/server-onboarding.md) · [../docs/architecture/WIDGET_EMBED_OPS.md](../docs/architecture/WIDGET_EMBED_OPS.md)
4. Frontend (same workspace): [../frontend/](../frontend/) · brand [../frontend/AGENTS.md](../frontend/AGENTS.md)
5. Cursor rules: [../.cursor/rules/](../.cursor/rules/)

---

## Workspace isolation (mandatory)

| Path | Role |
|------|------|
| **This workspace** | `RAGSuite` — CE monorepo |
| Backend code | `RAGSuite/backend` |
| Frontend code | `RAGSuite/frontend` |
| EE modules | Sibling `RAGSuite-EE` (or `$RAGSUITE_EE_ROOT`) |
| **Do not touch** | Legacy sibling clones |

All Community product edits stay under this repo. Never modify legacy clones.

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
- **`GET /crawl/sites` must stay fast:** tiny candidate sets use per-item vector probes (never full metadata scans of large collections). List enrichment is fail-soft (~8s) so Postgres sources still return when the vector lookup is slow.

**Crawl / embedding UX (shipped):** coverage-first Edit radio; model-aware Start Crawl confirm; Stop Crawl; no vector purge on Update; indexed labels from actual collections; same chat/search model+collection keeps Edit “already indexed” info.

**Modules:** Community packages under `../modules/<id>/`. Platform loader scans `modules/`, `extensions/`, then optional `$RAGSUITE_EE_ROOT`. Independence: no module→module imports (see `tests/test_module_independence.py`).

**Production / multi-tenant:** Compose stacks (one per tenant on a shared host). Never `down -v`. See [server-onboarding.md](docs/operations/server-onboarding.md) and [WIDGET_EMBED_OPS.md](../docs/architecture/WIDGET_EMBED_OPS.md).
