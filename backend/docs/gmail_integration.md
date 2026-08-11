# Gmail Integration — Technical Documentation

> **Agent note (2026-07):** New Gmail documents use `type="text/plain"` (legacy rows may say `txt`). Content preview uses `/documents/{id}/content` with authenticated fetch; embedding coverage after ingest needs cache invalidate / `skip_cache`. Work in this backend workspace only for API changes — Gmail UI lives in frontend (Server workspace).


## Overview

Gmail integration allows RAGSuite to fetch emails from a connected Gmail account, store them as indexed documents, and make them searchable via RAG chat. Emails are treated identically to uploaded documents — chunked, embedded, and stored in ChromaDB.

---

## Architecture

### Flow Diagram

```
User → OAuth2 (Google) → Tokens saved in DB
                              ↓
                    APScheduler (every 5 min)
                              ↓
                    Gmail API (fetch emails)
                              ↓
                    Text extraction + temp file
                              ↓
                    locked_ingest() → ChromaDB
                              ↓
                    UploadedDocument record in PostgreSQL
                              ↓
                    RAG Chat (searchable)
```

---

## New Database Tables

### `gmail_integrations`

Stores OAuth tokens and sync config per user+project (one row per connected Gmail account).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | Integer | FK → users |
| `project_id` | UUID | FK → projects |
| `email_address` | String | Connected Gmail address |
| `access_token` | Text | Google OAuth access token |
| `refresh_token` | Text | Google OAuth refresh token (for renewal) |
| `token_expiry` | DateTime | When access token expires |
| `is_active` | Boolean | Whether auto-sync is enabled |
| `cadence_minutes` | Integer | How often to sync (default: 30 min) |
| `max_emails_per_sync` | Integer | Max emails per sync run (default: 100) |
| `last_sync_at` | DateTime | Timestamp of last successful sync |
| `last_history_id` | String | Gmail historyId for incremental sync |
| `emails_indexed` | Integer | Total emails indexed (cumulative) |
| `status` | Enum | ACTIVE / PAUSED / ERROR / DISCONNECTED |
| `created_at` | DateTime | Row creation time |
| `updated_at` | DateTime | Last update time |

### `gmail_sync_jobs`

Tracks each sync execution (like `crawl_jobs` tracks crawl runs).

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `integration_id` | UUID | FK → gmail_integrations |
| `status` | Enum | PENDING / RUNNING / COMPLETED / FAILED |
| `emails_fetched` | Integer | Emails retrieved from Gmail API |
| `emails_indexed` | Integer | Emails successfully ingested into ChromaDB |
| `errors` | JSON | Array of error objects |
| `queued_at` | DateTime | When job was created |
| `started_at` | DateTime | When job began executing |
| `finished_at` | DateTime | When job completed |

---

## New Files

### `app/services/gmail_service.py`

Core Gmail logic. Key functions:

| Function | Purpose |
|----------|---------|
| `get_auth_url(project_id, user_id)` | Generates Google OAuth2 URL with PKCE verifier. Stores verifier in `_pending_verifiers` dict keyed by state. |
| `parse_oauth_state(state)` | Decodes base64 state param → `{project_id, user_id}` |
| `exchange_code_for_tokens(code, redirect_uri, state)` | Exchanges OAuth code for tokens. Retrieves PKCE verifier from `_pending_verifiers` using state. |
| `get_gmail_user_email(access_token)` | Calls Google userinfo API to get Gmail address |
| `fetch_emails(access_token, refresh_token, max_results, last_history_id)` | Fetches emails. First sync uses `messages.list`. Subsequent syncs use `history.list` (incremental, faster). Returns `(emails, new_history_id)` |
| `ingest_email(parsed, user_id, project_id, db)` | Deduplicates by `gmail_message_id`, writes temp `.txt` file, calls `locked_ingest()`, creates `UploadedDocument` record, deletes temp file |
| `revoke_token(access_token)` | Calls Google revocation endpoint |
| `delete_integration_documents(integration_id, project_id, db)` | Removes all Gmail docs from ChromaDB + PostgreSQL |

### `app/routes/gmail.py`

FastAPI router with 8 endpoints. All require JWT auth (`get_current_user_required`) + `project_id` query param.

### `alembic/versions/add_gmail_integration_tables.py`

Database migration creating both tables with indexes.

---

## Modified Files

| File | Change |
|------|--------|
| `app/models.py` | Added `GmailIntegration`, `GmailSyncJob` models + `GmailIntegrationStatus`, `GmailSyncJobStatus` enums |
| `app/schemas.py` | Added `GmailIntegrationOut`, `GmailSyncJobOut`, `GmailAuthUrlOut`, `GmailConnectRequest` Pydantic schemas |
| `app/settings.py` | Added `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` settings |
| `app/services/scheduler.py` | Added `sync_gmail_integrations()` job + `_run_gmail_sync_thread()` + registered job every 5 minutes |
| `app/main.py` | Registered gmail router with try/except ImportError pattern |
| `requirements.txt` | Added `google-api-python-client`, `google-auth-oauthlib`, `google-auth-httplib2` |
| `.env` | Added Google OAuth credentials |

---

## API Endpoints

### `GET /api/v1/gmail/auth/url`
Returns Google OAuth2 URL to redirect user to.

**Query params:** `project_id` (UUID)

**Response:**
```json
{ "auth_url": "https://accounts.google.com/o/oauth2/auth?..." }
```

---

### `GET /api/v1/gmail/auth/callback`
Google redirects here after user authorizes. Exchanges code for tokens, saves `GmailIntegration` to DB, redirects to frontend.

**Query params:** `code`, `state`, `error` (optional)

---

### `GET /api/v1/gmail/status`
Returns current integration status for a project.

**Query params:** `project_id`

**Response:** `GmailIntegrationOut` object or `null`

---

### `POST /api/v1/gmail/sync`
Manually triggers an email sync. Creates `GmailSyncJob`, runs in background thread.

**Query params:** `project_id`

**Response:** `GmailSyncJobOut` with `status: "PENDING"`

---

### `POST /api/v1/gmail/pause`
Pauses auto-sync. Sets `is_active=false`, `status=PAUSED`.

---

### `POST /api/v1/gmail/resume`
Resumes auto-sync. Sets `is_active=true`, `status=ACTIVE`.

---

### `DELETE /api/v1/gmail/disconnect`
- Revokes Google OAuth token
- Deletes all Gmail `UploadedDocument` records from PostgreSQL
- Removes Gmail embeddings from ChromaDB
- Deletes `GmailIntegration` row

**Response:** `{ "message": "Gmail disconnected. N emails removed." }`

---

### `GET /api/v1/gmail/jobs`
Returns sync job history for a project (most recent first).

**Query params:** `project_id`, `limit` (default 20)

---

## OAuth2 Flow (PKCE)

Gmail uses Google OAuth2 with PKCE (Proof Key for Code Exchange) — required for web app credentials:

```
1. GET /auth/url
       ↓ generates code_verifier + code_challenge
       ↓ stores verifier in _pending_verifiers[state]
       ↓ returns auth URL with code_challenge embedded

2. User opens URL → Google login → Allow

3. Google → GET /auth/callback?code=XXX&state=YYY
       ↓ retrieves verifier from _pending_verifiers[state]
       ↓ exchanges code + verifier for tokens
       ↓ fetches email address from userinfo API
       ↓ saves GmailIntegration to DB
       ↓ redirects to frontend
```

---

## Email Ingestion Pipeline

Each email goes through:

```
Gmail API message (raw JSON)
        ↓
_parse_message() → extract subject, sender, date, body
        ↓
_decode_body() → recursively extract text/plain from MIME parts
        ↓
_email_to_text() → format as:
    "From: sender\nSubject: subject\nDate: date\n\nbody"
        ↓
Dedup check → query UploadedDocument WHERE meta_data->>'gmail_message_id' = X
        ↓ (skip if exists)
Write to data/tmp/{doc_id}_gmail_{subject}.txt
        ↓
locked_ingest(path, document_id, user_id, project_id)
        ↓
ChromaDB (vector embeddings via all-MiniLM-L6-v2)
        ↓
UploadedDocument record (source="gmail", meta_data has gmail_message_id)
        ↓
Delete temp file
```

---

## Incremental Sync

Two sync modes:

| Mode | When | API Used |
|------|------|---------|
| **Full sync** | First time (`last_history_id` is null) | `messages.list` — fetches last N emails |
| **Incremental sync** | Subsequent syncs | `history.list(startHistoryId=last_history_id)` — only new emails since last sync |

Incremental sync is much faster — only fetches emails added since last run. `historyId` is saved after every sync.

---

## Scheduler

APScheduler job registered in `start_scheduler()`:

```
Job: sync_gmail_integrations
Trigger: IntervalTrigger(minutes=5)   ← checks every 5 min
```

Each check:
1. Queries all `GmailIntegration` where `is_active=True AND status=ACTIVE`
2. For each: checks if `(now - last_sync_at) >= cadence_minutes`
3. If due: creates `GmailSyncJob`, spawns background thread
4. Each integration syncs independently at its own cadence

---

## Email Storage in ChromaDB

Emails stored as `UploadedDocument` with:

```python
source = "gmail"
title = "[Gmail] {subject}"
type = "txt"
meta_data = {
    "gmail_message_id": "...",   # Google's message ID (used for dedup)
    "thread_id": "...",
    "sender": "from@example.com",
    "subject": "Email subject",
    "date": "Mon, 21 Apr 2026 ..."
}
```

ChromaDB chunks have same metadata as all other documents — fully queryable by `project_id` and `user_id`.

---

## Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `google-api-python-client` | ≥2.100.0 | Gmail API client (`googleapiclient.discovery`) |
| `google-auth-oauthlib` | ≥1.1.0 | OAuth2 flow (`google_auth_oauthlib.flow.Flow`) |
| `google-auth-httplib2` | ≥0.1.0 | HTTP transport for Google auth |

---

## Environment Variables

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/gmail/auth/callback
```

---

## Security Notes

- Tokens stored as plain text in DB (same pattern as LLM API keys in this codebase). Encrypt at rest for production.
- OAuth scopes are minimal: `gmail.readonly` + `userinfo.email` + `openid`. No write access to Gmail.
- Email body truncated at 50,000 characters to prevent oversized embeddings.
- Dedup guard prevents re-indexing same email across multiple syncs.
- Token revocation called on disconnect — invalidates access at Google side.

---

## Setup Checklist

- [ ] `pip install google-api-python-client google-auth-oauthlib google-auth-httplib2`
- [ ] `alembic upgrade head`
- [ ] Google Cloud Console: enable Gmail API
- [ ] Google Cloud Console: OAuth consent screen configured with scopes
- [ ] Google Cloud Console: Web application OAuth client created
- [ ] Redirect URI `http://localhost:8000/api/v1/gmail/auth/callback` added to OAuth client
- [ ] `.env` updated with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- [ ] Server restarted
- [ ] OAuth flow completed via `/api/v1/gmail/auth/url`
- [ ] Status confirmed via `/api/v1/gmail/status`
- [ ] First sync triggered via `/api/v1/gmail/sync`
