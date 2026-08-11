# Backend Data Models

**Source:** `backend/app/models.py`  
**Migrations:** `backend/alembic/versions/`  
**Last updated:** 2026-07-03

---

## Entity relationship (simplified)

```text
Organization ──< User.org_id
User ──< Project (owner_id)
User ──< UserSession, APIKey, Settings, LLMConfig, ...
Project ──< CrawlSource ──< CrawlJob
Project ──< UploadedDocument, ChatMessage, ApiKey, Webhook
Project ──< ChatbotSettings, SearchSettings (per user+project)
Project ──< ConnectorIntegration, GmailIntegration, ClickUpIntegration, N8nIntegration
ConnectorIntegration ──< ConnectorSource, ConnectorSettings, ConnectorSyncJob, ConnectorDocument
ChromaDB collections keyed by project_id
```

---

## Tables

### `users` — `User`

| Column | Type | Notes |
|--------|------|-------|
| `id` | int PK | |
| `username`, `email` | string | unique |
| `hashed_password` | string | bcrypt |
| `is_active`, `is_admin` | bool | `is_admin` legacy; org role in `organization_members` |
| `org_id` | FK → organizations | nullable |
| `provisioned_by` | FK → users | Admin who created account |
| `must_change_password` | bool | Force password change on login |
| `auth_provider` | string | `local` \| `sso` |
| `email_verified_at` | datetime | required for JWT+ unless disabled |
| `onboarding_completed_at` | datetime | |
| Profile fields | | job_title, department, phone, location, timezone, bio, avatar |
| 2FA fields | | totp_secret, is_2fa_enabled, email_2fa_enabled, backup_codes |
| `last_login`, `last_activity` | datetime | inactivity logout |

### `organizations` — `Organization`

| Column | Notes |
|--------|-------|
| `id`, `name`, `slug` | unique slug |
| `max_users`, `max_projects`, `max_crawls_per_user` | quota overrides (0=use default) |
| `max_queued_ingest_per_project`, `max_concurrent_ingest_per_project` | ingest quotas |
| `registration_enabled` | Org-level public signup gate (default `false`) |
| `default_member_permissions` | JSON default permissions for new members |

### `organization_members` — `OrganizationMember`

| Column | Notes |
|--------|-------|
| `org_id`, `user_id` | unique pair |
| `role` | `org_admin` \| `member` |
| `is_active` | Deactivate without delete |
| `invited_by`, `joined_at` | Audit |

### `project_members` — `ProjectMember`

| Column | Notes |
|--------|-------|
| `project_id`, `user_id` | unique pair |
| `permissions` | JSON array of permission strings |
| `granted_by` | Admin user id |

### `organization_sso_configs` — `OrganizationSsoConfig`

One row per org. Google OIDC: `client_id`, `client_secret_encrypted`, `email_domains`, `enabled`, `jit_provisioning_enabled` (false in phase 1).

### `user_idp_identities` — `UserIdpIdentity`

Links `users` to Google `sub` per org. Unique `(org_id, idp_subject, protocol)`.

See [organization-and-sso.md](./organization-and-sso.md).

### `user_sessions` — `UserSession`

JWT session tracking: `token_jti`, `is_active`, `expires_at`, device/IP metadata.

### `email_verification_tokens` — `EmailVerificationToken`

`user_id`, `token_hash`, `expires_at`, `purpose` (signup, login_2fa).

### `projects` — `Project`

| Column | Notes |
|--------|-------|
| `id` | UUID |
| `name`, `description` | |
| `owner_id` | FK → users |
| `org_id` | FK → organizations |
| `is_active` | | |

~~**Planned:** `org_id` FK~~ — **implemented**

### `crawl_sources` — `CrawlSource`

`project_id`, `base_url`, `depth`, `cadence`, `headless`, allow/deny lists, crawl limits, `skip_header_footer`.

### `crawl_jobs` — `CrawlJob`

`source_id`, `status` (PENDING, RUNNING, WAITING, INDEXING, COMPLETED, FAILED, …), `pages_fetched`, errors, timestamps.

### `documents` — `Document`

Crawled page metadata: `source_id`, `url`, `title`, `text_content`, `meta_data`.

### `uploaded_documents` — `UploadedDocument`

Manual uploads: `project_id`, `user_id`, `title`, binary `text_content`, `chunks`, `status`, `trained_at`.

### `chat_messages` — `ChatMessage`

`project_id`, `session_id`, `message_id`, user/assistant text, `message_type` (chat/search), `sources` JSON, feedback fields, `execution_snapshot`, moderation fields.

### `query_logs` — `QueryLog`

Analytics: `project_id`, `user_id`, `apikey_id`, query text, mode, latency, token usage, `chat_message_id`.

### `analytics_days` — `AnalyticsDay`

Daily rollups: `date`, `project_id`, `org_id`, query counts, latency, thumbs-up rate.

### `api_keys` — `APIKey`

`key`, `key_hash`, `project_id`, `environment`, `rate_limit`, `expires_at`, `created_by_id`.

### `settings` — `Settings`

Per-user branding: `org_name`, `logo_data_url`, `primary_color` (unique `user_id`).

### `chatbot_settings` — `ChatbotSettings`

Per user+project: widget UI, LLM/RAG params, `is_active`. Unique `(user_id, project_id)`.

### `search_settings` — `SearchSettings`

Per user+project: search prompt/UI, LLM/RAG params.

### `llm_configs` — `LLMConfig`

Legacy combined LLM config per user.

### `model_config_profiles` — `ModelConfigProfile`

Compare-models profiles: `user_id`, `project_id`, `profile_type`, provider/model params.

### `webhooks` — `Webhook`

`user_id`, `project_id`, `url`, `events`, `secret`, `is_active`.

### `integration_embeds` — `IntegrationEmbed`

Widget embed config: `public_id`, `embed_secret`, domain keys JSON.

### `audit_events` — `AuditEvent`

`user_id`, `project_id`, `event_type`, `payload` JSON, IP.

**Planned:** `org_id` on audit events.

### `notifications` — `Notification`

`user_id`, `type`, `title`, `message`, `is_read`.

### `background_jobs` — `BackgroundJob`

| Column | Notes |
|--------|-------|
| `job_type` | enum — see [services-and-jobs.md](./services-and-jobs.md) |
| `status` | PENDING, RUNNING, COMPLETED, FAILED, … |
| `user_id`, `project_id` | tenant scope |
| `payload` | JSON |
| `priority`, `job_class` | fairness tiers |
| `idempotency_key` | dedup (e.g. connector sync) |
| `attempts`, `error` | retry state |

### `job_archive` — `JobArchive`

Cold storage for completed/failed jobs.

### `reindex_jobs` — `ReindexJob`

`project_id` + `source` unique; progress counters.

---

## Gmail tables

| Table | Model | Purpose |
|-------|-------|---------|
| `gmail_integrations` | `GmailIntegration` | Tokens, cadence, status |
| `gmail_project_credentials` | `GmailProjectCredential` | Per-project OAuth app creds |
| `gmail_sync_jobs` | `GmailSyncJob` | Sync history |
| `gmail_staged_messages` | `GmailStagedMessage` | Inbox staging before index |

---

## ClickUp tables

| Table | Model |
|-------|-------|
| `clickup_integrations` | `ClickUpIntegration` |
| `clickup_sync_jobs` | `ClickUpSyncJob` |

---

## Connector framework tables

| Table | Model | Purpose |
|-------|-------|---------|
| `connector_project_credentials` | `ConnectorProjectCredential` | OAuth app creds per project+type |
| `connector_integrations` | `ConnectorIntegration` | Connection, encrypted tokens, status |
| `connector_sources` | `ConnectorSource` | Selected sources JSON |
| `connector_settings` | `ConnectorSettings` | Cadence, limits JSON |
| `connector_sync_jobs` | `ConnectorSyncJob` | Sync run history |
| `connector_documents` | `ConnectorDocument` | External file id, hash, document link |

**`connector_type` values (implemented):** `google_drive`, `notion`, `confluence`, `sharepoint`, `slack`.

---

## n8n

| Table | Model |
|-------|-------|
| `n8n_integrations` | `N8nIntegration` |

---

## Enums (key)

| Enum | Values |
|------|--------|
| `BackgroundJobType` | CRAWL, CRAWL_FETCH, CRAWL_INGEST_BATCH, DOCUMENT_INGEST, PURGE_*, REINDEX, SEND_VERIFICATION_EMAIL, WEBHOOK_DELIVERY, DATA_FOLDER_INGEST, GMAIL_SYNC, CONNECTOR_SYNC, PURGE_CONNECTOR_INTEGRATION |
| `ConnectorIntegrationStatus` | connected, disconnected, error, … |
| `CrawlJobStatus` | includes WAITING, INDEXING |

---

## Migration notes

- Run: `cd backend && alembic upgrade head`
- `failed_crawl_urls` exists in migrations but **no ORM model** in `models.py`
- New tables for org/SSO: see [future/](./future/README.md)

---

## Pydantic schemas

Request/response types in `backend/app/schemas.py` — pair with routes in [api-reference.md](./api-reference.md). When adding endpoints, always add schemas here.
