# Backend API Reference

**Base URL:** `/api/v1`  
**Interactive docs:** `/docs`  
**Last updated:** 2026-07-07

### Auth legend

| Code | Dependency | Meaning |
|------|------------|---------|
| **Public** | — | No authentication |
| **JWT+** | `get_current_user_required` | Valid session + email verified |
| **JWT** | `get_current_user` | Valid session (no email-verify gate) |
| **Admin** | `get_current_admin_user` | JWT+ and global `is_admin` or `org_admin` membership |
| **Org member** | `get_current_org_member` | JWT+ and active `organization_members` row |
| **Org admin** | `require_org_admin` | Org member with `role=org_admin` (or legacy `is_admin`) |
| **Project ACL** | `require_project_permission(...)` | Project access via owner, org admin, or `project_members` |
| **Widget** | `get_project_id_or_user` | JWT, API key, or embed token + project |
| **JWT\|API** | `get_current_user_or_api_key` | Bearer JWT or API key |
| **+Proj** | `get_active_project` | User's active project required |

**Important:** Authentication endpoints live under **`/crawl/auth/*`**, not `/auth/*`.

---

## Authentication (`routes/crawl.py` → `/crawl/auth`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/crawl/auth/login` | Public | Login; returns JWT cookie + body; may return `requires_2fa` + `temp_token` |
| POST | `/crawl/auth/login/verify-2fa` | Public | Complete TOTP/email 2FA login |
| POST | `/crawl/auth/login/resend-2fa` | Public | Resend login 2FA code |
| POST | `/crawl/auth/logout` | JWT+ | Revoke session |
| GET | `/crawl/auth/verify` | JWT+ | Verify current session |
| GET | `/crawl/auth/public-config` | Public | `{ registration_enabled, sso_enabled, organization_slug }` |
| POST | `/crawl/auth/register` | Public | Bootstrap first admin, or activate pending invite by password (public signup blocked after bootstrap) |
| POST | `/crawl/auth/verify-email` | Public | Verify email OTP/token |
| POST | `/crawl/auth/resend-verification` | Public | Resend verification email |

### Login request/response (contract)

**POST `/crawl/auth/login`**
```json
// Request
{ "username": "string", "password": "string" }

// Response (success, no 2FA)
{
  "access_token": "string",
  "token_type": "bearer",
  "user": { "id", "username", "email", "is_admin", "is_active", ... }
}

// Response (2FA required)
{ "requires_2fa": true, "temp_token": "string", "method": "totp|email" }
```

**GET `/crawl/auth/public-config`**
```json
{
  "registration_enabled": false,
  "sso_enabled": true,
  "organization_slug": "default"
}
```

`sso_enabled` is true when `SSO_ENABLED=true` in env **and** org has enabled SSO config with client credentials.

---

## SSO (`routes/auth_sso.py` → `/auth/sso`)

Google OIDC only (phase 1). See [organization-and-sso.md](./organization-and-sso.md).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/auth/sso/discover` | Public | `?email=` → `{ org_slug, sso_enabled, provider }` |
| GET | `/auth/sso/start` | Public | `?org_slug=` → 302 redirect to Google (browser navigation) |
| GET | `/auth/sso/callback` | Public | OIDC callback → login/link/first-admin bootstrap/invite activation → session cookie redirect |

Requires `SSO_ENABLED=true` in env. Once an active org admin exists, non-invited unknown users are rejected.

---

## Organization (`routes/organization.py` → `/org`)

Admin/user management. See [organization-and-sso.md](./organization-and-sso.md).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/org` | Org member | Org summary (counts, quotas) |
| PUT | `/org` | Org admin | Update name, `registration_enabled`, default permissions |
| GET | `/org/users` | Org admin | List users `?is_active&role&q` |
| POST | `/org/users` | Org admin | Create pending invite user (inactive until first password or Google activation) |
| PATCH | `/org/users/{user_id}` | Org admin | Update user profile, role, active |
| DELETE | `/org/users/{user_id}` | Org admin | Deactivate user + revoke sessions |
| GET | `/org/users/{user_id}/projects` | Org admin | List project assignments |
| PUT | `/org/users/{user_id}/projects` | Org admin | Replace assignments `{ user_id, assignments[] }` |
| GET | `/org/projects` | Org admin | List all org projects |
| POST | `/org/projects` | Org admin | Create project `{ "name", "description?" }` |
| GET | `/org/sso` | Org admin | Get Google SSO config (secret masked) |
| PUT | `/org/sso` | Org admin | Update SSO config |
| POST | `/org/sso/test` | Org admin | Test Google OIDC connectivity |

### POST `/org/users` request

```json
{
  "username": "jane",
  "email": "jane@acme.com",
  "role": "member",
  "temporary_password": null,
  "project_assignments": [
    { "project_id": "uuid", "permissions": ["project:read", "chat:use"] }
  ]
}
```

Roles: `org_admin` | `member`. Permissions: see `OrgProjectPermission` in `schemas.py`.

---

## Crawl (`routes/crawl.py` → `/crawl`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/crawl/sites` | JWT+ | Create crawl source |
| GET | `/crawl/sites` | JWT+ | List crawl sources (active project) |
| PUT | `/crawl/sites/{source_id}` | JWT+ | Update source |
| DELETE | `/crawl/sites/{source_id}` | JWT+ | Delete source |
| POST | `/crawl/start/{source_id}` | JWT+ | Enqueue crawl job |
| GET | `/crawl/status/{job_id}` | JWT+ | Crawl job status |
| PUT | `/crawl/preview` | JWT+ | Preview URL extraction `{ url }` |

Crawl source fields (snake_case): `base_url`, `depth`, `cadence`, `allowlist`, `denylist`, `headless`, `skip_header_footer`, etc.

---

## Projects (`routes/projects.py` → `/projects`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/projects` | JWT+ | Create project |
| GET | `/projects` | JWT+ | List user's projects |
| GET | `/projects/{project_uuid}` | JWT+ | Get project |
| PUT | `/projects/{project_id}` | JWT+ | Update project |
| DELETE | `/projects/{project_id}` | JWT+ | Delete project (async cleanup job) |
| POST | `/projects/{project_id}/activate` | JWT+ | Set active project for session |

---

## Documents (`routes/documents.py` → `/documents`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/documents` | JWT+ +Proj | List indexed documents |
| POST | `/documents/upload` | JWT+ +Proj | Multipart upload → queue `DOCUMENT_INGEST` |
| PUT | `/documents/{id}` | JWT+ | Update metadata |
| DELETE | `/documents/{id}` | JWT+ | Remove from index |
| GET | `/documents/{id}/content` | Widget | Get document text |
| GET | `/documents/{id}/chunks` | JWT+ +Proj | Paginated chunks `?limit&offset` |
| GET | `/documents/{id}/content-token` | Widget | Short-lived access token |
| GET | `/documents/{id}/content-stream` | Token | Stream content `?token=` |

---

## Embeddings / reindex (`routes/embeddings.py` → `/projects`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/projects/{project_id}/embedding-status` | JWT+ | Coverage `?source=search\|chat` |
| GET | `/projects/{project_id}/embedding-item-coverage` | JWT+ | Per-item coverage |
| POST | `/projects/{project_id}/reindex` | JWT+ | Start reindex job |
| GET | `/projects/{project_id}/reindex-progress` | JWT+ | Reindex progress |

---

## Chat & search (`routes/rag.py`)

Mobile SDK clients (React Native `@ragsuite/react-native`, Flutter `ragsuite_flutter_init`) use `Authorization: Bearer rgs_live_...` on the same routes as web widgets. Auth column **Widget** below means **Widget \| API key \| JWT** unless marked JWT-only.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/config/rag-defaults` | Public | Default RAG parameters |
| POST | `/chat/message` | Widget | Chat (non-streaming) |
| POST | `/chat/message/stream` | Widget | Chat SSE |
| GET | `/chat/sessions` | JWT+ | List chat sessions |
| GET | `/chat/history` | Widget | Chat history |
| GET | `/chat/history/export` | JWT+ | Export CSV/JSON |
| GET | `/chat/messages/{message_id}` | Widget | Get message |
| DELETE | `/chat/messages/{message_id}` | Widget | Delete message |
| DELETE | `/chat/messages` | Widget | Bulk delete |
| DELETE | `/chat/sessions/{session_id}` | JWT+ +Proj | Delete session |
| POST | `/chat/feedback` | Widget | Thumbs up/down + reason |
| GET | `/search/prompt` | JWT\|API | Get search system prompt |
| PUT/POST | `/search/prompt` | JWT\|API | Save search prompt |
| GET | `/search/response-config` | Widget | Search response config |
| POST | `/search/response-config` | JWT+ +Proj | Save search response config |
| GET | `/rag/settings` | Widget | RAG settings snapshot |
| POST | `/search/query`, `/search` | Widget | Search (non-stream) |
| POST | `/search/stream` | Widget | Search SSE |
| POST | `/search/compare` | JWT+ +Proj | Compare models |
| POST | `/search/compare/stream` | JWT+ +Proj | Compare SSE |
| GET | `/search/history` | Widget | Search history |
| GET | `/search/sessions` | Widget | Search sessions |
| DELETE | `/search/sessions/{session_id}` | Widget | Delete search session |
| POST | `/search/feedback` | Widget | Search feedback |
| GET | `/search/messages/{message_id}` | Widget | Get search message |
| DELETE | `/search/messages/{message_id}` | Widget | Delete |
| DELETE | `/search/messages` | Widget | Bulk delete |
| PUT | `/search/activate` | Widget | Enable/disable search |
| GET | `/search/activate` | Widget | Get search active state |

### Widget chat/search body (typical)

```json
// POST /chat/message/stream
{ "message": "string", "session_id": "uuid|null" }

// POST /search/stream
{ "query": "string", "session_id": "uuid|null", "use_saved_rag_params": true }
```

---

## Search models & config (`routes/search_models.py`)

**Prefix `/search/models`**

| Method | Path | Auth |
|--------|------|------|
| GET | `/search/models/` | JWT+ |
| POST | `/search/models/` | JWT+ |
| POST | `/search/models/test` | JWT+ |
| GET | `/search/models/available` | JWT+ |

**Prefix `/search` (config)**

Mobile SDK (RN / Flutter) uses Bearer API key on GET routes below.

| Method | Path | Auth |
|--------|------|------|
| GET | `/search/configuration` | Widget \| API key \| JWT |
| POST | `/search/configuration` | JWT+ |
| GET | `/search/customization` | Widget \| API key \| JWT |
| POST | `/search/customization` | JWT+ |

**Prefix `/search/models/profiles`**

| Method | Path | Auth |
|--------|------|------|
| GET | `/search/models/profiles/` | JWT+ |
| POST | `/search/models/profiles/` | JWT+ |
| PUT | `/search/models/profiles/{profile_id}` | JWT+ |
| DELETE | `/search/models/profiles/{profile_id}` | JWT+ |

---

## Chat models (`routes/chat_models.py` → `/config-models`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/config-models/` | JWT+ |
| POST | `/config-models/` | JWT+ |
| POST | `/config-models/test` | JWT+ |
| GET | `/config-models/models` | JWT+ |

---

## Chatbot widget settings (`routes/chatbot.py` → `/chatbot`)

Mobile SDK (RN / Flutter) uses Bearer API key on read routes below. Auth **Widget \| API key \| JWT** = embed token or mobile Bearer.

| Method | Path | Auth |
|--------|------|------|
| GET | `/chatbot/settings` | Widget \| API key \| JWT |
| POST | `/chatbot/configuration` | Widget |
| POST | `/chatbot/customization` | Widget |
| PUT | `/chatbot/activate` | Widget |
| GET | `/chatbot/activate` | Widget |

---

## Search citation (`routes/search_citation.py` → `/search/citation`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/search/citation/` | JWT+ |
| POST | `/search/citation/` | JWT+ |

---

## Retrieve (`routes/retrieve.py`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/retrieve` | Widget | Vector retrieval only (no LLM); rate-limited |

---

## User profile (`routes/user.py` → `/user`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/user/profile` | JWT+ |
| PUT | `/user/profile` | JWT+ |
| PUT | `/user/profile/password` | JWT+ |
| GET | `/user/2fa/status` | JWT+ |
| POST | `/user/2fa/setup` | JWT+ |
| POST | `/user/2fa/verify` | JWT+ |
| POST | `/user/2fa/disable` | JWT+ |
| POST | `/user/2fa/email/enable` | JWT+ |
| POST | `/user/2fa/email/disable` | JWT+ |
| POST | `/user/2fa/backup-codes` | JWT+ |

---

## Sessions (`routes/sessions.py` → `/user/sessions`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/user/sessions` | JWT+ |
| DELETE | `/user/sessions/{session_id}` | JWT+ |
| DELETE | `/user/sessions` | JWT+ (revoke all others) |

---

## API keys (`routes/api_keys.py` → `/api-keys`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api-keys` | JWT+ +Proj |
| GET | `/api-keys` | JWT+ +Proj |
| GET | `/api-keys/{api_key_id}` | JWT+ |
| GET | `/api-keys/{api_key_id}/reveal` | JWT+ |
| DELETE | `/api-keys/{api_key_id}` | JWT+ |

Keys use prefix `rgs_live_` or `rgs_test_`.

---

## Integrations / embed (`routes/integrations.py` → `/integrations`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/integrations/match` | Public |
| GET | `/integrations/embed` | JWT+ |
| POST | `/integrations/embed` | JWT+ +Proj |
| DELETE | `/integrations/embed/keys/{key_id}` | JWT+ +Proj |
| DELETE | `/integrations/embed/{identifier}` | JWT+ +Proj |
| POST | `/integrations/domains/add` | JWT+ +Proj |

---

## Onboarding (`routes/onboarding.py` → `/onboarding`)

All JWT+.

| Method | Path |
|--------|------|
| POST | `/onboarding/branding` |
| GET | `/onboarding/branding` |
| POST | `/onboarding/project` |
| POST | `/onboarding/data-source` |
| POST | `/onboarding/test-query` |
| GET | `/onboarding/status` |
| GET | `/onboarding/data-source` |
| GET | `/onboarding/crawl-status` |
| GET | `/onboarding/suggestions` |
| POST | `/onboarding/complete` |

---

## Settings / branding (`routes/settings.py` → `/settings`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/settings` | Widget |
| POST | `/settings` | JWT+ |

---

## Overview (`routes/overview.py` → `/overview`)

All JWT+ +Proj.

| Method | Path |
|--------|------|
| GET | `/overview` |
| GET | `/overview/queries-over-time` |
| GET | `/overview/feedback/latest` |
| GET | `/overview/feedback/thumbs-up-rate` |
| GET | `/overview/latency/p95-latency` |
| GET | `/overview/crawl-errors` |
| GET | `/overview/top-sources` |

---

## Analytics (`routes/analytics.py` → `/analytics`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/analytics/overview` | JWT+ +Proj |
| GET | `/analytics/queries` | JWT+ +Proj |
| GET | `/analytics/popular` | JWT+ +Proj |
| GET | `/analytics/dashboard` | JWT+ +Proj |
| GET | `/analytics/satisfaction-time-series` | JWT+ +Proj |
| GET | `/analytics/source-coverage` | JWT+ +Proj |
| GET | `/analytics/popular-queries` | JWT+ +Proj |
| GET | `/analytics/hard-queries` | JWT+ +Proj |
| GET | `/analytics/latency-time-series` | JWT+ +Proj |
| GET | `/analytics/export` | JWT+ +Proj |
| POST | `/analytics/jobs/{job_id}/retry` | JWT+ +Proj |
| GET | `/system-health` | JWT+ |

### Health (separate `health_router`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | Public |
| GET | `/health/ping` | Public |
| GET | `/health/ready` | Public |
| GET | `/health/jobs` | Public |
| GET | `/health/concurrency-metrics` | Public |

---

## Integration analytics (`routes/integration_analytics.py`)

| Method | Path | Auth | Note |
|--------|------|------|------|
| GET | `/analytics/project/{project_id}` | **Public** | Embed/widget analytics — no auth dependency |

---

## Feedback moderation (`routes/feedback_moderation.py` → `/feedback`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/feedback/reason-catalog` | JWT+ +Proj |
| GET | `/feedback/moderation/entries` | JWT+ +Proj |
| GET | `/feedback/moderation/summary` | JWT+ +Proj |
| PATCH | `/feedback/moderation/{message_id}` | JWT+ +Proj |
| GET | `/feedback/moderation/export` | JWT+ +Proj |

---

## Audit (`routes/audit.py` → `/audit-events`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/audit-events` | JWT+ +Proj |
| GET | `/audit-events/{event_id}` | JWT+ |

---

## Webhooks (`routes/webhooks.py` → `/webhooks`)

| Method | Path | Auth |
|--------|------|------|
| POST | `/webhooks` | JWT+ |
| GET | `/webhooks` | JWT+ |
| GET | `/webhooks/{webhook_id}` | JWT+ |
| PATCH | `/webhooks/{webhook_id}` | JWT+ |
| POST | `/webhooks/{webhook_id}/regenerate-secret` | JWT+ |
| DELETE | `/webhooks/{webhook_id}` | JWT+ |
| POST | `/webhooks/{webhook_id}/test` | JWT+ |

---

## Notifications (`routes/notifications.py` → `/notifications`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/notifications` | JWT+ |
| GET | `/notifications/unread/count` | JWT+ |
| PUT | `/notifications/{notification_id}/read` | JWT+ |
| PUT | `/notifications/read-all` | JWT+ |
| DELETE | `/notifications/{notification_id}` | JWT+ |
| DELETE | `/notifications` | JWT+ |
| POST | `/notifications/test` | JWT+ |

---

## Prompt (`routes/prompt.py` → `/prompt`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/prompt` | JWT\|API |
| PUT/POST | `/prompt` | JWT\|API |
| POST | `/prompt/search` | JWT\|API |
| POST | `/prompt/chat` | JWT\|API |

---

## Chroma maintenance (`routes/chroma.py`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/chroma/health` | JWT+ |
| POST | `/chroma/repair` | JWT+ |
| GET | `/projects/{project_id}/chroma-health` | JWT+ |
| POST | `/projects/{project_id}/repair-index` | JWT+ |

---

## Gmail (`routes/gmail.py` → `/gmail`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/gmail/auth/url` | JWT+ |
| GET | `/gmail/auth/callback` | Public |
| POST | `/gmail/credentials` | JWT+ |
| GET | `/gmail/credentials/status` | JWT+ |
| GET | `/gmail/status` | JWT+ |
| POST | `/gmail/sync` | JWT+ |
| POST | `/gmail/pause` | JWT+ |
| POST | `/gmail/resume` | JWT+ |
| DELETE | `/gmail/disconnect` | JWT+ |
| GET | `/gmail/jobs` | JWT+ |
| GET | `/gmail/inbox` | JWT+ |
| POST | `/gmail/inbox/index` | JWT+ |
| POST | `/gmail/inbox/dismiss` | JWT+ |

---

## ClickUp (`routes/clickup.py` → `/clickup`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/clickup/auth/url` | JWT+ |
| GET | `/clickup/auth/callback` | Public |
| GET | `/clickup/status` | JWT+ |
| POST | `/clickup/sync` | JWT+ |
| POST | `/clickup/pause` | JWT+ |
| POST | `/clickup/resume` | JWT+ |
| DELETE | `/clickup/disconnect` | JWT+ |
| GET | `/clickup/jobs` | JWT+ |

---

## n8n (`routes/n8n.py` → `/n8n`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/n8n/status` | JWT+ |
| PUT | `/n8n/config` | JWT+ |
| PATCH | `/n8n/{integration_id}/enable` | JWT+ |
| POST | `/n8n/{integration_id}/test` | JWT+ |
| DELETE | `/n8n/{integration_id}` | JWT+ |
| GET | `/n8n/inbound-template` | JWT+ |
| POST | `/n8n/retrieve/test` | JWT+ |

---

## Connectors {#connectors}

Shared pattern for all five framework connectors. Replace `{type}` with the connector type. Routers: `connectors.py` (Drive), `connectors_notion.py`, `connectors_confluence.py`, `connectors_sharepoint.py`, `connectors_slack.py`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/connectors/{type}/auth/start` | JWT+ | `?project_id=` → OAuth URL |
| GET | `/connectors/{type}/auth/callback` | Public | OAuth callback HTML |
| POST | `/connectors/{type}/credentials` | JWT+ | Save OAuth app credentials |
| GET | `/connectors/{type}/credentials/status` | JWT+ | Credential status |
| GET | `/connectors/{type}/status` | JWT+ | `?project_id=` integration status |
| GET | `/connectors/{type}/browse` | JWT+ | Drive: browse files |
| GET | `/connectors/{type}/folders` | JWT+ | Drive: folder tree |
| GET | `/connectors/{type}/search` | JWT+ | Notion: search pages |
| GET | `/connectors/{type}/spaces` | JWT+ | Confluence: list spaces |
| GET | `/connectors/{type}/sites` | JWT+ | SharePoint: search sites |
| GET | `/connectors/{type}/drives` | JWT+ | SharePoint: document libraries |
| GET | `/connectors/{type}/channels` | JWT+ | Slack: list channels |
| POST | `/connectors/{type}/sources` | JWT+ | Set sync sources |
| POST | `/connectors/{type}/settings` | JWT+ | Cadence, limits |
| POST | `/connectors/{type}/sync` | JWT+ | Trigger `CONNECTOR_SYNC` |
| GET | `/connectors/{type}/jobs` | JWT+ | Sync job history |
| POST | `/connectors/{type}/pause` | JWT+ | Pause integration |
| POST | `/connectors/{type}/resume` | JWT+ | Resume |
| POST | `/connectors/{type}/disconnect` | JWT+ | Disconnect + purge job |

**Types implemented:** `google_drive`, `notion`, `confluence`, `sharepoint`, `slack`  
**Product docs:** [../connectors/README.md](../connectors/README.md) · archived checklist: [future/connectors.md](./future/connectors.md)

### Integration status response shape (all connectors)

```json
{
  "id": "uuid",
  "account_label": "string|null",
  "status": "connected|disconnected|error|...",
  "is_active": true,
  "last_sync_at": "datetime|null",
  "documents_indexed": 0,
  "settings": { "cadence_minutes": 30, "max_files": 100, "max_size_mb": 50, ... },
  "sources": { "folders": [], "files": [] },
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Static & misc (`main.py`)

| Method | Path | Auth |
|--------|------|------|
| GET | `/` | Public |
| GET | `/rag-config.js` | Public |
| GET | `/api/v1/widget/v1/*` | Public |
| GET | `/api/v1/search-widget/v1/*` | Public |
| GET | `/api/v1/avatars`, `/api/v1/avatars/{file}` | Public |

---

## Planned routes (not implemented)

| Prefix | Doc |
|--------|-----|
| SAML SSO, SCIM | [planned/sso.md](../planned/sso.md) |

**Implemented (see sections above):** `/org/*`, `/auth/sso/*`, `/org/sso`, all five `/connectors/{type}/*`

---

## Response conventions

- Many admin endpoints return raw JSON objects or arrays.
- Some wrap: `{ "success": true, "data": {...}, "message": "..." }` — frontend services handle both.
- Errors: FastAPI `HTTPException` → `{ "detail": "string" | [...] }`
- Pagination: query params `limit`, `offset`, `page` vary by endpoint — check `schemas.py` and `/docs`.
- **Field naming:** API uses **snake_case**; frontend services often map to camelCase in hooks.
