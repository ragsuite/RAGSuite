# Backend API Contract (RAGSuite_Server/backend)

> **Purpose:** Give RAGSuite_Server/frontend agents a precise map of the **standalone RAGSuite backend** so this Expo client stays compatible without guessing paths.  
> **Canonical backend path:** `/Users/arun/RAGSuite_Server/backend` (same workspace — edit when the task needs API changes).  
> **Authoritative backend docs:** `docs/backend/api-reference.md`, `docs/backend/external-client-contract.md`, `docs/backend/architecture.md`, `docs/frontend/*`.  
> **Client endpoint map:** `src/network/apiUrl.ts` (must stay aligned with this contract).  
> **Last synced:** 2026-07-08

---

## 1. What the backend is

| Fact | Value |
| ---- | ----- |
| Role | Multi-tenant RAG **API + workers only** (no bundled UI) |
| Layout | `app/` at backend repo root (not `backend/app/`) |
| Stack | FastAPI, SQLAlchemy, Alembic, PostgreSQL, ChromaDB, Redis, Postgres `background_jobs` queue |
| Dev API port | **9090** (standalone). Avoid confusing with legacy monorepo `:8000` |
| Chroma / Redis (dev) | Chroma **8003**, Redis **6380** |
| API prefix | **`/api/v1`** on every admin/widget route below |
| Wire format | **snake_case** JSON; this client maps to camelCase in feature mappers |
| Dual auth | **Bearer JWT** *or* `access_token` cookie (`app/auth.py`). Mobile uses **Bearer**. Do not ask backend to remove cookies. |

### Processes

```text
API (run.py / uvicorn / Gunicorn)
  → auth, enqueue jobs, RAG queries
Worker (`python -m app.worker`)
  → claim background_jobs (crawl, DOCUMENT_INGEST, CONNECTOR_SYNC, …)
Scheduler (API lifespan)
  → cadence crawls / Gmail / connectors
Chroma sidecar (optional HTTP mode)
```

### Isolation model

- **`project_id`** is the primary data boundary (sources, documents, messages, API keys, connector integrations).
- **Organization** — one org per deployment; quotas, members, SSO config (`/org/*`).
- ACL via `organization_members` / `project_members` (partial rollout on feature routes).

### Request lifecycle (mental model)

```text
HTTP → CORS → rate limit → route → auth deps
  → services → PostgreSQL / enqueue / Chroma / Redis
  → Pydantic response
```

---

## 2. How this client joins URLs

| Item | Rule |
| ---- | ---- |
| `env.json` → `API_URL` | **Origin only** — e.g. `http://localhost:9090` or an ngrok host. **Not** `…/api/v1` unless you verify joining. |
| `API_CONFIG` in `apiUrl.ts` | Paths already include `/api/v1/...` |
| Axios | `src/network/request.ts` — attaches `Authorization: Bearer <token>` |
| 401 | Clears SecureStore / localStorage session when a token was sent |
| Streaming | Prefer `fetch` + Bearer (not axios) for SSE (`/chat/message/stream`, `/search/stream`, …) |

Legacy Vite SPA (`/Users/arun/Desktop/RAGSUITE/frontend`) uses **cookie + `withCredentials`** and often sets `VITE_API_BASE_URL` to `…/api/v1`. Do not copy that pattern blindly into Expo.

---

## 3. Auth (password) — `/api/v1/crawl/auth/*`

Password admin auth is **under crawl**, not `/auth/login`.

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/api/v1/crawl/auth/login` | `{ username, password }` → `access_token` + user *or* `requires_2fa` + `temp_token` |
| POST | `/api/v1/crawl/auth/login/verify-2fa` | `{ temp_token, code }` |
| POST | `/api/v1/crawl/auth/login/resend-2fa` | |
| POST | `/api/v1/crawl/auth/logout` | |
| GET | `/api/v1/crawl/auth/verify` | Boot hydrate |
| GET | `/api/v1/crawl/auth/public-config` | `{ registration_enabled, sso_enabled, organization_slug }` — **mobile gap G1** (not in `apiUrl.ts` yet) |
| POST | `/api/v1/crawl/auth/register` | Bootstrap / invite activation |
| POST | `/api/v1/crawl/auth/verify-email` | |
| POST | `/api/v1/crawl/auth/resend-verification` | |

**Mobile flow today:** login → optional 2FA → store Bearer → verify on boot. No `public-config`. No SSO UI.

---

## 4. SSO — `/api/v1/auth/sso/*` (backend ready; mobile UI pending)

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/api/v1/auth/sso/discover` | Optional by email |
| GET | `/api/v1/auth/sso/start` | **Full-page navigate** with `?org_slug=` (not Axios) |
| GET | `/api/v1/auth/sso/callback` | Google → backend; then redirect |

After SSO, backend redirects to `{FRONTEND_BASE_URL}/login/callback?success=1`. Client must `GET /crawl/auth/verify` and persist session.  
IdP redirect URI registered in Google: `{SSO_CALLBACK_BASE_URL}/api/v1/auth/sso/callback` (dev base often `http://localhost:9090`).

---

## 5. Organization — `/api/v1/org/*` (backend ready; mobile UI pending)

| Area | Paths |
| ---- | ----- |
| Org summary | `GET/PUT /api/v1/org` |
| Users | `GET/POST/PATCH/DELETE /api/v1/org/users` |
| User ↔ projects | `GET/PUT /api/v1/org/users/{id}/projects` |
| Org projects | `GET/POST /api/v1/org/projects` |
| SSO settings | `GET/PUT /api/v1/org/sso`, `POST /api/v1/org/sso/test` |

Mobile today only surfaces branding `org_name` via `GET/PUT /api/v1/settings` — gap G3.

---

## 6. Projects & embeddings

| Action | Path |
| ------ | ---- |
| List / create | `GET/POST /api/v1/projects` |
| CRUD | `GET/PUT/DELETE /api/v1/projects/{id}` |
| Activate | `POST /api/v1/projects/{id}/activate` |
| Embedding status | `GET /api/v1/projects/{id}/embedding-status` |
| Reindex | `POST /api/v1/projects/{id}/reindex` |
| Reindex progress | `GET /api/v1/projects/{id}/reindex-progress` |
| Coverage | `GET /api/v1/projects/{id}/embedding-item-coverage` |

Many crawl/connector/document calls take `?project_id=` (or body `project_id`). Prefer active project from `ActiveProjectProvider`.

---

## 7. Crawl sites & documents

| Action | Path |
| ------ | ---- |
| Sites | `/api/v1/crawl/sites` (+ `/{id}`) |
| Start | `POST /api/v1/crawl/start/{id}` |
| Status | `GET /api/v1/crawl/status/{jobId}` |
| Preview | `POST /api/v1/crawl/preview` |
| Jobs | `GET /api/v1/crawl/jobs` |
| Documents | `/api/v1/documents` (+ upload multipart, content, chunks, tokens) |

---

## 8. Connectors & Gmail (critical path rules)

### 8.1 Path families (do not conflate)

| Integration | API prefix | Mobile UI | Notes |
| ----------- | ---------- | --------- | ----- |
| **Gmail** | **`/api/v1/gmail/*`** | ✅ Crawl tab | **Legacy** tables/router. **Not** under `/connectors/`. Do not refactor when adding MCP connectors. |
| **Google Drive** | `/api/v1/connectors/google_drive/*` | ✅ | Shared connector framework |
| **Notion** | `/api/v1/connectors/notion/*` | ✅ | Shared connector framework |
| **Confluence** | `/api/v1/connectors/confluence/*` | ❌ gap G5 | Browse: `/spaces` |
| **SharePoint** | `/api/v1/connectors/sharepoint/*` | ❌ gap G5 | Browse: `/sites`, `/drives` |
| **Slack** | `/api/v1/connectors/slack/*` | ❌ gap G5 | Browse: `/channels` |
| **ClickUp** | `/api/v1/clickup/*` | ❌ defer G6 | Legacy; UI optional |
| **n8n** | `/api/v1/n8n/*` | ✅ Configuration | |

### 8.2 Shared connector routes (`{type}` = slug above)

All under `/api/v1`:

| Method | Path |
| ------ | ---- |
| GET | `/connectors/{type}/auth/start` |
| GET | `/connectors/{type}/auth/callback` | Public OAuth callback HTML |
| POST | `/connectors/{type}/credentials` |
| GET | `/connectors/{type}/credentials/status` |
| GET | `/connectors/{type}/status` |
| GET | `/connectors/{type}/browse` | Drive |
| GET | `/connectors/{type}/folders` | Drive |
| GET | `/connectors/{type}/search` | Notion |
| GET | `/connectors/{type}/spaces` | Confluence |
| GET | `/connectors/{type}/sites` / `/drives` | SharePoint |
| GET | `/connectors/{type}/channels` | Slack |
| POST | `/connectors/{type}/sources` |
| POST | `/connectors/{type}/settings` |
| POST | `/connectors/{type}/sync` | Enqueues `CONNECTOR_SYNC` |
| GET | `/connectors/{type}/jobs` |
| POST | `/connectors/{type}/pause` / `/resume` |
| POST | `/connectors/{type}/disconnect` | + purge job |

**Job pipeline:** connect → sources/settings → `CONNECTOR_SYNC` (fetch only) → stage/hash → per-file `DOCUMENT_INGEST` → Chroma. Never inline ingest inside sync.

### 8.3 Gmail routes (legacy)

| Method | Path |
| ------ | ---- |
| GET | `/api/v1/gmail/auth/url` |
| GET | `/api/v1/gmail/auth/callback` | Public |
| POST | `/api/v1/gmail/credentials` |
| GET | `/api/v1/gmail/credentials/status` |
| GET | `/api/v1/gmail/status` |
| POST | `/api/v1/gmail/sync` / `/pause` / `/resume` |
| DELETE | `/api/v1/gmail/disconnect` |
| GET | `/api/v1/gmail/jobs` |
| GET | `/api/v1/gmail/inbox` |
| POST | `/api/v1/gmail/inbox/index` / `/dismiss` |

### 8.4 OAuth redirect URI contract (register these exact paths)

Redirects land on the **API host**, not the Expo origin. **Backend is authoritative.**

| Provider | Redirect URI (backend truth) |
| -------- | ---------------------------- |
| Gmail | `{API_ORIGIN}/api/v1/gmail/auth/callback` |
| Notion | `{API_ORIGIN}/api/v1/connectors/notion/auth/callback` |
| Google Drive | `{API_ORIGIN}/api/v1/connectors/google_drive/auth/callback` |
| Google SSO (IdP → API) | `{API_ORIGIN}/api/v1/auth/sso/callback` |

`{API_ORIGIN}` = same host as `API_URL` (e.g. `http://localhost:9090` or ngrok).  
Env default (`GOOGLE_REDIRECT_URI`): `http://localhost:9090/api/v1/gmail/auth/callback`.  
Connector callbacks return HTML and `postMessage({ type: 'connector_connected', connector: '…' }, APP_ORIGIN)`.

**Client helpers:** `src/features/crawl/utils/*-oauth.ts` + `connector-oauth.ts` build display/copy Redirect URI fields.

**Known client drift (document only — fix in a code task):** as of 2026-07-08, `getGmailOAuthRedirectUri()` may emit `/api/v1/connectors/gmail/auth/callback` via `buildConnectorOAuthRedirectUri('gmail')`. That path is **wrong for this backend** (no `/connectors/gmail` router). Correct Gmail redirect remains **`/api/v1/gmail/auth/callback`**. Drive/Notion helpers that add `/api/v1` and use `/connectors/{type}` are aligned. Network actions for Gmail already correctly call `/api/v1/gmail/*` in `apiUrl.ts`.

---

## 9. Chat, search, chatbot, retrieve

| Area | Paths (all `/api/v1`) |
| ---- | --------------------- |
| Chat | `/chat/message`, `/chat/message/stream`, `/chat/feedback`, `/chat/history`, `/chat/sessions`, … |
| Search | `/search`, `/search/query`, `/search/stream`, `/search/compare`, `/search/compare/stream`, history/sessions |
| RAG settings | `/rag/settings` |
| Chatbot widget config | `/chatbot/*` |
| Search models / UI | `/search/models/`, `/search/configuration`, `/search/customization`, `/search/citation/` |
| Chat models | `/config-models/` |
| Compare models (dedicated) | `/compare-models/configs`, `/compare-models/compare` |
| Retrieve | `/retrieve` |
| Prompt | `/prompt` |
| Embed | `/integrations/embed` |

Widget headers (not admin Bearer): `X-Project-ID`, `X-Widget-Mode`, optional `X-Widget-Token`, `X-Request-Domain`, `X-Request-Url`.

---

## 10. Ops, config, user

| Area | Paths |
| ---- | ----- |
| Overview / analytics | `/overview/*`, `/analytics/*` |
| Feedback moderation | `/feedback/moderation/*` |
| Audit | `/audit-events` |
| Notifications | `/notifications/*` |
| System health | `/system-health` |
| API keys | `/api-keys` |
| n8n | `/n8n/inbound-template`, `/n8n/retrieve/test` |
| Settings (branding) | `/settings` |
| Onboarding | `/onboarding/*` |
| User profile / 2FA / sessions | `/user/profile`, `/user/2fa/*`, `/user/sessions` |
| Webhooks | `/webhooks` |
| Static widgets | `/widget/v1/*`, `/search-widget/v1/*`, `/avatars/*` |

---

## 11. Response & typing patterns

```text
Pattern A: response.data → object
Pattern B: response.data → { success, data, message }  // use data || payload
```

Always handle both in new `*.actions.ts` methods. Prefer snake_case in request bodies for crawl/connectors (`base_url`, `project_id`, …).

---

## 12. Common mistakes

| Wrong | Correct |
| ----- | ------- |
| `POST /auth/login` | `POST /crawl/auth/login` |
| Gmail under `/connectors/gmail` | Gmail under **`/gmail`** |
| Drive/Notion without `/api/v1` | `/api/v1/connectors/{type}/…` |
| Assume cookies-only or Bearer-only | Dual auth on backend |
| Skip `public-config` forever | Needed for login-only + SSO gating |
| Axios for SSO start | Full-page `GET /auth/sso/start` |
| Put `…/api/v1` in mobile `API_URL` blindly | Origin + verify `apiUrl.ts` joins |
| Treat root backend `docs/architecture.md` (monorepo-era) as sole truth | Prefer `docs/backend/architecture.md` + AI memory in backend |

---

## 13. Local pairing

```bash
# Backend (read-only workspace for agents here)
./start.sh   # API :9090

# RAGSuite_Server/frontend
# Set envs/local.json API_URL to http://localhost:9090 (or tunnel origin)
yarn env:local && yarn web
```

`FRONTEND_BASE_URL` / `CORS_ORIGINS` on the backend must match the Expo web origin for SSO and credentialed browser flows.

---

## Related (this repo)

- Compatibility gaps & status: [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md)
- Architecture (client): [ARCHITECTURE.md](./ARCHITECTURE.md)
- Module map: [MODULE_GUIDE.md](./MODULE_GUIDE.md)
- UI parity vs **legacy SPA** (not the backend matrix): [WEB_MOBILE_PARITY.md](./WEB_MOBILE_PARITY.md)
- Skill: [../.cursor/skills/ragsuite-backend-contract/SKILL.md](../.cursor/skills/ragsuite-backend-contract/SKILL.md)

## Related (backend repo — do not edit from mobile tasks)

- `docs/frontend/COMPATIBILITY_GAPS.md`
- `docs/frontend/MOBILE_RAGSUITE.md`
- `docs/backend/external-client-contract.md`
- `docs/backend/api-reference.md`
- `docs/connectors/README.md`
