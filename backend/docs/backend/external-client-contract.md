# External client API contract

**Purpose:** Reference for any **external** admin SPA, Expo client, or widget connecting to this backend.  
**Full route catalog:** [api-reference.md](./api-reference.md)  
**Last updated:** 2026-08-06  
**Organization + SSO:** [organization-and-sso.md](./organization-and-sso.md)  
**Frontend migration:** [../frontend/README.md](../frontend/README.md)

> **This repo is backend-only.** No frontend app is bundled. Point your client at `http://localhost:9090` (mobile `API_URL` origin) or `http://localhost:9090/api/v1` (legacy relative-style clients). Set `FRONTEND_BASE_URL` in backend `.env` for OAuth/SSO redirects.

---

## Supported clients

| Client | Path | Session | Status |
|--------|------|---------|--------|
| **Target — frontend (Server workspace)** | `/Users/arun/RAGSuite_Server/frontend` | **Bearer** `Authorization` from login `access_token` | Primary going forward; gaps in [../frontend/COMPATIBILITY_GAPS.md](../frontend/COMPATIBILITY_GAPS.md) |
| Legacy Vite SPA | `/Users/arun/Desktop/RAGSUITE/frontend` | **Cookie** + `withCredentials: true` | Historically compatible for core ops |

**Auth extraction (`app/auth.py`):** Bearer credentials **or** `access_token` cookie. Prefer Bearer for native/Expo; cookies remain valid for browser SPAs and SSO callback.

**Local pairing (2026-07):** API `:9090` · frontend (Server workspace) Expo web `:9091` · set `FRONTEND_BASE_URL=http://localhost:9091` and include that origin in CORS. SSO callback may put `access_token` in the URL hash for cross-origin Bearer hydrate (cookies alone are insufficient Expo web ↔ API). Document `content-stream` URLs must use the API origin, never `:9091`.


---

## Base URL & client

| Item | Value |
|------|--------|
| Base path | `/api/v1` |
| **Standalone backend dev API** | `http://localhost:9090/api/v1` |
| Monorepo dev API (legacy) | `http://localhost:8000/api/v1` |
| `FRONTEND_BASE_URL` (SSO/OAuth redirects) | Must match the client that owns `/login/callback` — **target Expo web: `http://localhost:9091`** (legacy Vite may use `:9091`) |
| Legacy monorepo frontend | `http://localhost:5173` |
| Legacy client reference | `frontend/client/src/services/api/client.ts` |
| frontend (Server workspace) reference | `src/network/request.ts` + `apiUrl.ts` |
| Legacy credentials | `withCredentials: true` |
| frontend (Server workspace) credentials | Bearer header; cookies optional |

Set `VITE_API_BASE_URL=http://localhost:9090/api/v1` when using monorepo frontend against this backend.  
Set mobile `env.json` `API_URL` to `http://localhost:9090` (verify path joining in `apiUrl.ts`).

---

## Authentication (admin SPA)

### Dual transport

```text
Login always returns access_token in JSON body and may set httpOnly cookie.

Legacy Vite: rely on cookie; withCredentials: true; token state often unused.
frontend (Server workspace): store access_token; Authorization: Bearer <token> on requests.
```

### Login flow (password)

```text
1. POST /crawl/auth/login  { username, password }
2. If requires_2fa: POST /crawl/auth/login/verify-2fa { temp_token, code }
3. Persist session (cookie and/or Bearer from body)
4. GET /crawl/auth/verify on app load
```

### Public config (login page) — required for login-only + SSO

```http
GET /crawl/auth/public-config
```

```json
{
  "registration_enabled": false,
  "sso_enabled": true,
  "organization_slug": "default"
}
```

| Field | Frontend action |
|-------|-----------------|
| `registration_enabled` | Hide public signup when `false` |
| `sso_enabled` | Show Google SSO button when `true` |
| `organization_slug` | Pass to `/auth/sso/start?org_slug=` |

**Legacy SPA** implements registration gate. **frontend (Server workspace)** must add this call (gap G1).

### Registration and invite activation

```http
POST /crawl/auth/register  → first user bootstraps admin; post-bootstrap only invited pending users can activate
POST /crawl/auth/verify-email
```

When `registration_enabled: false`, hide public signup UI entirely. Keep `/crawl/auth/register` available only for invite activation forms.

### Google SSO (optional) — backend ready; UI pending on mobile

```text
1. GET /auth/sso/discover?email=user@company.com   (optional)
2. Browser navigate: GET /auth/sso/start?org_slug=default
3. Google consent → backend /auth/sso/callback
4. Redirect to {FRONTEND_BASE_URL}/login/callback?success=1
5. Client: GET /crawl/auth/verify → store session (cookie and/or Bearer) → go to app
```

- Use **full page navigation** for `/auth/sso/start` (not axios POST).
- First Google sign-in can bootstrap admin only when no active org admin exists.
- After bootstrap, user must be pre-created as a pending invite by org admin (same email as Google account).
- SSO sets the same `access_token` cookie as password login; mobile web session hydration after callback is part of [../frontend/COMPATIBILITY_PLAN.md](../frontend/COMPATIBILITY_PLAN.md) workstream A.
- RAGSuite 2FA is skipped for SSO logins.

See [organization-and-sso.md](./organization-and-sso.md) for TypeScript types and admin APIs.

### Logout

```
POST /crawl/auth/logout
```

### 401 handling

Clear local session and redirect to login (except widget mode and 2FA paths). Legacy: clear localStorage. Mobile: clear SecureStore / storage session.

---

## Widget authentication

Widgets do **not** use user login.

| Header | Required |
|--------|----------|
| `X-Project-ID` | Yes |
| `X-Widget-Mode` | `true` |
| `X-Widget-Token` | If embed secret configured |
| `X-Request-Domain` | Embedding site host |
| `X-Request-Url` | Full page URL |

Globals: `RAGSUITE_API_URL`, `RAGSUITE_PROJECT_ID`, `RAGSUITE_EMBED_TOKEN`

**Do not** use the web embed token or widget headers in the mobile SDK (React Native or Flutter).

---

## Mobile SDK authentication (React Native and Flutter)

Mobile embed clients use a **project-scoped API key** from **Configuration → API Keys** — not the web embed token from Integrations → Web.

| Surface | Credential | Headers | Project scope |
|---------|------------|---------|---------------|
| **Web HTML embed** | Embed token + allowed domains | `X-Widget-Token`, `X-Project-ID`, `X-Widget-Mode: true`, `X-Request-Domain` | Token / project ID + domain allowlist |
| **Mobile SDK (RN / Flutter)** | `rgs_live_...` or `rgs_test_...` | `Authorization: Bearer <key>` only | From key's `project_id` |

**Prohibited for mobile:** `X-Widget-Token`, `X-Widget-Mode`, embed token as Bearer value.

### Mobile SDK routes (existing APIs — no new paths)

| Priority | Method | Path |
|----------|--------|------|
| P0 | GET | `/chatbot/settings` |
| P0 | POST | `/chat/message` |
| P0 | POST | `/chat/message/stream` |
| P0 | POST | `/chat/feedback` |
| P1 | GET | `/search/configuration` |
| P1 | GET | `/search/customization` |
| P1 | POST | `/search` or `/search/query` |
| P1 | POST | `/search/stream` |
| P1 | POST | `/search/feedback` |

Self-hosted: each customer uses their own `{origin}/api/v1` from Admin → Integrations.

See also [auth-and-security.md](./auth-and-security.md).

---

## Endpoint map (authoritative paths)

### Auth & user

| Frontend service | Backend path |
|------------------|--------------|
| `authAPI.login` | `POST /crawl/auth/login` |
| `authAPI.verify2FA` | `POST /crawl/auth/login/verify-2fa` |
| `authAPI.register` | `POST /crawl/auth/register` |
| `authAPI.getPublicConfig` | `GET /crawl/auth/public-config` |
| `userAPI.getProfile` | `GET /user/profile` |
| `userAPI.updateProfile` | `PUT /user/profile` |
| Sessions | `GET/DELETE /user/sessions` |

### Projects

| Action | Path |
|--------|------|
| List | `GET /projects` |
| Create | `POST /projects` |
| Activate | `POST /projects/{id}/activate` |
| CRUD | `GET/PUT/DELETE /projects/{id}` |

### Crawl & documents

| Action | Path |
|--------|------|
| Sites CRUD | `/crawl/sites` |
| Start crawl | `POST /crawl/start/{source_id}` |
| Status | `GET /crawl/status/{job_id}` |
| Upload | `POST /documents/upload` (multipart) |
| List docs | `GET /documents` |
| Reindex | `POST /projects/{id}/reindex` |
| Embedding status | `GET /projects/{id}/embedding-status` |

### Chat & search

| Action | Path |
|--------|------|
| Chat (admin) | `POST /chat/message` |
| Chat stream | `POST /chat/message/stream` (SSE via fetch) |
| Search | `POST /search` or `/search/query` |
| Search stream | `POST /search/stream` (SSE) |
| Compare | `POST /search/compare/stream` |
| History | `GET /chat/history`, `GET /search/history` |
| Feedback | `POST /chat/feedback`, `POST /search/feedback` |

### Configuration

| Action | Path |
|--------|------|
| Chat models | `GET/POST /config-models/` |
| Search models | `GET/POST /search/models/` |
| Chatbot widget | `GET/POST /chatbot/settings`, `/configuration`, `/customization` |
| Search UI | `GET/POST /search/configuration`, `/customization`, `/citation/` |
| System prompt | `GET/POST /prompt` |
| Embed | `GET/POST /integrations/embed` |

### Connectors

| Integration | Path prefix | Legacy SPA UI | frontend (Server workspace) UI |
|-------------|-------------|---------------|--------------------|
| Gmail | `/gmail/*` | ✅ | ✅ |
| Google Drive | `/connectors/google_drive/*` | ✅ | ✅ |
| Notion | `/connectors/notion/*` | ✅ | ✅ |
| Confluence | `/connectors/confluence/*` | ❌ | ❌ |
| SharePoint | `/connectors/sharepoint/*` | ❌ | ❌ |
| Slack | `/connectors/slack/*` | ❌ | ❌ |
| ClickUp | `/clickup/*` | ❌ | ❌ |
| n8n | `/n8n/*` | ✅ | ✅ |

Browse helpers differ by type: Drive `/browse`+`/folders`, Notion `/search`, Confluence `/spaces`, SharePoint `/sites`+`/drives`, Slack `/channels`.

### Analytics & ops

| Action | Path |
|--------|------|
| Overview | `GET /overview`, `/overview/queries-over-time`, ... |
| Dashboard | `GET /analytics/dashboard` |
| System health | `GET /system-health` |
| Audit | `GET /audit-events` |
| API keys | `/api-keys` |

---

## Type alignment

**Legacy:** `frontend/client/src/services/api/types.ts`  
**Mobile:** feature `types/` + mappers under `src/features/*/`; paths in `src/network/apiUrl.ts`

| Backend (snake_case) | Frontend type |
|----------------------|---------------|
| `base_url` | Mapped to `baseUrl` / camelCase in client layers |
| `is_admin` | `user.is_admin` in LoginResponse |
| `requires_2fa` | `LoginResponse.requires_2fa` |
| `execution_snapshot` | Chat history items |
| `owner_id` | `Project.owner_id` |

**Do not use (legacy):** `client/src/types/api.ts` (aspirational), `shared/schema.ts` (unused Drizzle).

---

## Response shape patterns

```typescript
// Pattern A — raw object
response.data → { id, name, ... }

// Pattern B — wrapped
response.data → { success: true, data: { ... }, message: "..." }
// Services use: response.data.data || response.data
```

Always handle both in new service/action methods.

---

## SSE streaming

Use `fetch` (not axios):

| Endpoint | Legacy | frontend (Server workspace) |
|----------|--------|-----------------|
| `POST /chat/message/stream` | `credentials: 'include'` | `Authorization: Bearer` |
| `POST /search/stream` | same | same |
| `POST /search/compare/stream` | same | same |

---

## Pages → backend (quick reference)

| Route (legacy / mobile) | Primary APIs |
|-------------------------|--------------|
| `/login` · `/(auth)/sign-in` | `/crawl/auth/*`, `/auth/sso/*` |
| `/login/callback` | SSO redirect → `/crawl/auth/verify` (**pending in mobile**) |
| `/team` or org settings | `/org/users`, `/org/users/{id}/projects` (**pending in mobile**) |
| `/settings/sso` | `/org/sso` GET/PUT/POST test (**pending**) |
| `/` · tabs index | `/overview/*`, `/analytics/dashboard` |
| `/crawl` · `crawl-management` | `/crawl/*`, `/documents/*`, connectors |
| Chatbot / search config | `/chatbot/*`, `/search/*`, `/integrations/embed` |
| `/configuration` | `/api-keys`, `/n8n/*` |
| `/profile` | `/user/*` |
| `/integrations` | ⚠️ Mock on legacy — real connectors on Crawl |
| `/audit-logs` | `/audit-events` |

---

## Organization & SSO APIs (implemented — backend ready)

Full spec: [organization-and-sso.md](./organization-and-sso.md)

| Feature | Endpoints |
|---------|-----------|
| Org summary | `GET /org`, `PUT /org` |
| User admin | `GET/POST/PATCH/DELETE /org/users` |
| Project assignments | `GET/PUT /org/users/{id}/projects` |
| Org projects | `GET/POST /org/projects` |
| SSO settings | `GET/PUT /org/sso`, `POST /org/sso/test` |
| SSO login | `GET /auth/sso/discover`, `/start`, `/callback` |

**Frontend:** Implement on **frontend (Server workspace)** per [../frontend/COMPATIBILITY_PLAN.md](../frontend/COMPATIBILITY_PLAN.md).

## Planned backend APIs (not yet shipped)

| Feature | Frontend will use |
|---------|-------------------|
| SAML SSO, SCIM | TBD — see [planned/sso.md](../planned/sso.md) |

**Shipped connectors (UI still external for Confluence/SharePoint/Slack):** same contract as Drive/Notion.

---

## Common mismatches to avoid

| Wrong | Correct |
|-------|---------|
| `POST /auth/login` | `POST /crawl/auth/login` |
| Assuming only cookies work | Bearer **or** cookie |
| Assuming only Bearer works | Do not remove cookie support |
| Expect signup when `registration_enabled: false` | Hide signup UI / invite-only |
| Skipping `public-config` on mobile | Required for login-only + SSO gating |
| Use axios for SSO start | Full-page redirect to `/auth/sso/start` |
| camelCase in request body for crawl | snake_case (`base_url`, `allowlist`) |
| mobile `API_URL` = `.../api/v1` without checking joins | Verify against `apiUrl.ts` |

---

## External API consumers (API keys)

Use `Authorization: Bearer rgs_live_...` or `rgs_test_...` for **mobile SDK (React Native, Flutter) and programmatic** access to embed-compatible endpoints.

| Consumer | Auth |
|----------|------|
| **Mobile SDK (RN / Flutter)** | Project-scoped API key (`rgs_live_` / `rgs_test_`) — see [Mobile SDK authentication](#mobile-sdk-authentication-react-native-and-flutter) |
| **Automation / n8n** | Same API key pattern for `/chat/message`, `/search`, `/retrieve` |

Admin SPA / human session client uses **JWT only** — not API keys on the logged-in session.

**Web HTML embed** uses embed token + widget headers — not `rgs_live_` keys. See [Widget authentication](#widget-authentication).
