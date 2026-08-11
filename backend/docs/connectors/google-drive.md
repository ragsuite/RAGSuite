# Google Drive Connector — Implementation Plan (standalone)

**Status:** ✅ **Implemented** (2026)  
**Connector type:** `google_drive`  
**API prefix:** `/api/v1/connectors/google_drive`  
**Build order:** 1st (framework built as part of this work)  
**Effort:** ~1 week  
**Do not modify:** Gmail or ClickUp code/tables

> This document remains the reference for architecture, hardening, and tests. For remaining connectors, copy this implementation pattern.

---

## Goal

Let users connect Google Drive, pick folders, and search their files in RAG chat and search.

Users do everything from the UI: enable connector → credentials → Connect → pick folders → set rules → content syncs on a schedule. **No deploy needed for config** — settings live in DB.

---

## End-to-end flow

```
User → Integrations UI → Connect Google → Pick folders → Set rules
                              ↓
              CONNECTOR_SYNC job (fetch only; one per integration at a time)
                              ↓
              Drive API: list + download/export → staging file
                              ↓
              Content-hash check → skip if unchanged
                              ↓
              DOCUMENT_INGEST job per file (ingest caps + fair queue)
                              ↓
              ingest_document_to_all_targets_sync → locked_ingest() → ChromaDB
                              ↓
              RAG chat + search (both collections)
```

---

## Shared framework (required — include in this implementation)

### Database tables (new only)

| Table | Purpose |
|-------|---------|
| `connector_integrations` | Per user + project + `connector_type`; encrypted tokens; status |
| `connector_sources` | Selected folders (JSON) |
| `connector_settings` | Cadence, limits, rules (JSON) — **validate server-side** |
| `connector_sync_jobs` | Sync run history, errors, counts |
| `connector_documents` | **Required** source tracking: `fileId`, content hash, `document_id`, `project_id`, `integration_id`, staging path, `pageToken` cursor |

**Unique constraint:** one active integration per `(user_id, project_id, connector_type)` or per project policy you choose.

### Background job types

| Type | Role |
|------|------|
| `CONNECTOR_SYNC` | List/download/export only; enqueue one `DOCUMENT_INGEST` per file |
| `DOCUMENT_INGEST` | Existing job type — embed one staged file |

**Idempotency:** `connector_sync:{integration_id}` while `PENDING`/`RUNNING`.

### Backend files

```
backend/app/models.py                         → connector tables + enums
backend/app/schemas.py                        → Pydantic request/response types
backend/app/routes/connectors.py              → generic routes + Drive-specific mounts
backend/app/services/connectors/
  __init__.py
  framework.py                                → shared connect/disconnect/sync enqueue
  google_drive.py                             → Drive API client
backend/alembic/versions/                     → migration
backend/app/services/job_queue.py             → add CONNECTOR_SYNC handler
backend/app/services/scheduler.py             → connector sync scheduler tick
frontend/client/src/pages/Connectors.tsx      → integrations UI (Drive section)
```

### Reuse from existing codebase

| Pattern | Location |
|---------|----------|
| OAuth state | `security_utils.create_oauth_state`, `verify_oauth_state` |
| Encrypt tokens | `security_utils.encrypt_secret`, `decrypt_secret` |
| Job enqueue | `job_queue.enqueue_job`, `enqueue_document_ingest` |
| Ingest all collections | `document_ingest_orchestration.ingest_document_to_all_targets_sync` |
| Google OAuth (reference) | `gmail_service.get_auth_url`, `exchange_code_for_tokens` — **do not copy inline ingest** |
| OAuth callback HTML | `routes/gmail.py` — **fix `postMessage` to app origin, not `'*'`** |
| SSRF on URLs | `security_utils.block_ssrf` |
| Project owner check | `gmail._ensure_project_owner` pattern |

### Production hardening (mandatory)

### Must-fix before build (do not change existing flows)

| Problem | Required solution |
|---------|-------------------|
| Worker cannot read staged Drive files if backend and worker run in separate containers | Add shared staging storage for connector files: shared Docker volume for v1, or object storage later |
| Project data isolation | Every integration, source, document, vector/chunk, sync job, and purge must carry `project_id`; chat/search must filter by current project |
| Duplicate Drive syncs | Use connector-only sync locking and idempotency key `connector_sync:{integration_id}`; do not copy Gmail's per-sync-job idempotency pattern |
| Re-indexing unchanged files | Make `connector_documents` mandatory and skip ingest when the Drive `fileId` content hash is unchanged |
| Drive slowing other features | Give Drive its own caps, lower-priority/background jobs, small batches, and defer Drive sync when ingest workers are busy |
| Existing feature risk | Add Drive beside existing systems; do **not** refactor Gmail, ClickUp, crawl, upload, or existing job flows |

| Area | Requirement |
|------|-------------|
| **Ingest** | Never call `locked_ingest()` inside `CONNECTOR_SYNC`; always `DOCUMENT_INGEST` per file |
| **Targets** | `ingest_document_to_all_targets_sync` (search + chat), same as uploads |
| **Dedup** | Content hash per `fileId`; skip embed when unchanged |
| **Project isolation** | Store and filter by `project_id` everywhere; Project A Drive content must never appear in Project B chat/search |
| **Disconnect** | Enqueue vector purge by `integration_id` + `source=google_drive` |
| **Limits** | Enforce `max_files`, `max_size_mb`, cadence in API — ignore bad client JSON |
| **Manual sync** | Rate limit per integration **and** per org |
| **Scheduler** | Global cap on connector syncs started per tick |
| **Performance isolation** | Drive uses leftover capacity: connector job caps, small batches, lower priority than uploads, and busy-worker deferral |
| **Queue** | No inline sync fallback in API if enqueue fails — log/alert |
| **OAuth** | Redis for nonce replay protection; fail closed if Redis down in multi-worker prod |
| **OAuth callback** | `postMessage({ type: 'connector_connected', connector: 'google_drive' }, APP_ORIGIN)` |
| **Secrets scan** | Block obvious API keys in extracted text before ingest |
| **AI** | Synced docs are untrusted; harden system prompt against injection |
| **Staging (v1)** | Optional review queue before ingest (recommended for first release) |
| **Ops** | Log `integration_id` + `sync_job_id` on every step; alert if last sync > 24h stale |
| **Infra prod** | `CHROMA_MODE=http`, `ENABLE_CHROMA_PER_COLLECTION_LOCK=true`, dedicated `app.worker`, `enable_redis_admission=true` |

### Rules

| Do | Don't |
|----|-------|
| Use new connector tables | Change Gmail/ClickUp tables or routes |
| Enforce project-wise isolation with `project_id` | Allow Drive content to cross project boundaries |
| Use shared connector staging storage | Assume backend and worker share local files by default |
| `DOCUMENT_INGEST` per file | Ingest inside sync job (Gmail anti-pattern) |
| Keep Drive background work capped and low priority | Let Drive sync flood the shared ingest queue |
| Server-enforce limits | Trust UI for caps |
| Content-hash skip on re-sync | Re-embed every file every 30 min |
| Purge on disconnect | Leave orphan vectors |
| Encrypt tokens in DB | Plaintext tokens |

---

## Platform setup

1. Use existing Google Cloud project (same as Gmail) or create new one
2. Enable **Google Drive API**
3. OAuth scope: `https://www.googleapis.com/auth/drive.readonly`
4. Add redirect URI: `{API_BASE}/api/connectors/google_drive/auth/callback` (or shared callback with `state.provider`)

---

## Auth

| Item | Value |
|------|-------|
| Type | OAuth 2.0 |
| Scopes | `drive.readonly` |
| Token refresh | Yes — reuse Google refresh flow from Gmail service |
| Credentials | Project owner sets client ID/secret/redirect in UI, or system uses server defaults |
| State | `create_oauth_state(provider="google_drive", user_id, project_id)` |

Store `access_token`, `refresh_token`, `token_expiry` encrypted on `connector_integrations`.

---

## What users sync

- Folders (including shared drives if permitted)
- File types: Google Docs, Sheets, Slides, PDF, DOCX, TXT, etc.
- Exclude: videos, images (configurable rules)

---

## Backend tasks

| Task | Details |
|------|---------|
| OAuth connect/callback/disconnect/status | Generic connector routes + Drive provider |
| List folders | `files.list` with `mimeType = application/vnd.google-apps.folder` |
| List files in folder | Paginated; respect `max_files` cap |
| Download | Binary for PDF/DOCX/etc. |
| Export | Google Docs → `text/plain` or `application/pdf` via export API |
| Incremental sync | `changes.list` with stored `pageToken`; handle reset token (`410`) |
| Delete sync | `trashed=true` or removed → delete vectors by stable `source_id` |
| Dedup | Stable ID = Drive `fileId`; content hash before enqueue ingest |
| Ingest | Write staging file → `enqueue_document_ingest` with metadata: title, URL, modified date, `fileId` |
| MIME skip | Forms, Drawings, shortcuts — skip with reason in sync job errors |
| Large exports | Stream parse; row limits for huge Sheets |
| Per-source errors | Shared drive permission error on one folder must not fail entire sync |
| Disconnect | Purge job for all vectors with `meta.source=google_drive` + `integration_id` |
| Scheduler | Every 5 min tick; enqueue if `cadence_minutes` elapsed; respect global fan-out cap |
| `is_active` | Check at each batch; stop if disabled mid-sync |

### API routes (suggested)

```
GET  /api/connectors/google_drive/auth/start?project_id=
GET  /api/connectors/google_drive/auth/callback
POST /api/connectors/google_drive/credentials
GET  /api/connectors/google_drive/credentials/status
GET  /api/connectors/google_drive/status?project_id=
POST /api/connectors/google_drive/disconnect
GET  /api/connectors/google_drive/folders?project_id=     # rate limited
POST /api/connectors/google_drive/sources                 # save folder selection
POST /api/connectors/google_drive/sync                  # manual sync (rate limited)
```

---

## UI tasks

| Screen | Fields |
|--------|--------|
| Enable | Toggle per project |
| Credentials | Client ID, secret, redirect URI (project owner only; skip if server defaults exist) |
| Connect | “Connect Google Drive” → OAuth popup |
| Sources | Folder tree picker |
| Rules | File types, max size (MB), max files per sync |
| Sync | Schedule (minutes), pause, resume, manual sync |
| Status | Last sync, items indexed, errors, stale warning |

---

## Default limits (enforce on server)

| Setting | Default |
|---------|---------|
| Cadence | 30 minutes |
| Max files per sync | 100 |
| Max file size | 50 MB |
| Manual sync rate limit | 1 per minute per integration |
| Org manual sync | 10 per hour (suggested) |

---

## Problems & fixes

| Problem | Fix |
|---------|-----|
| Huge folder backfill | Cap per sync; project-owner option for “full sync” |
| Google Docs need export | Export before staging |
| Shared drive permission errors | Per-folder error; continue other sources |
| Duplicate files on re-sync | Content-hash skip |
| Deleted files still in RAG | Delete vectors on `trashed` |
| Disconnect leaves data | Purge job |
| `pageToken` invalid | Full resync with bounded file cap |
| Sync blocks platform | Two-phase jobs; Chroma HTTP + per-collection lock |
| Cost explosion | Hash skip + file caps + cadence |

---

## Implementation checklist

Historical build checklist (kept for traceability). Core connector support is implemented.

### Framework (if not already shipped)
- [ ] Migration: connector tables
- [ ] Make `connector_documents` required for hash dedup, cursor storage, and purge tracking
- [ ] Add shared connector staging storage visible to backend and worker
- [ ] `CONNECTOR_SYNC` + handler in `job_queue.py`
- [ ] Scheduler tick + connector-only lock + fan-out cap
- [ ] Connector-specific queue caps, small batch enqueue, and busy-worker deferral
- [ ] Enforce project-wise isolation in DB rows, vector metadata, chat/search filters, and purge logic
- [ ] Generic credentials/connect/disconnect routes
- [ ] Pydantic validation for settings limits

### Google Drive
- [ ] Enable Drive API in Google Cloud
- [ ] `connectors/google_drive.py` client
- [ ] OAuth start/callback (origin-safe `postMessage`)
- [ ] Folder list + file fetch + export
- [ ] `pageToken` cursor storage
- [ ] Content-hash + delete/trash sync
- [ ] Per-file `DOCUMENT_INGEST` enqueue
- [ ] Disconnect purge
- [ ] Connector sync idempotency key: `connector_sync:{integration_id}`
- [ ] UI: credentials, connect, folder picker, rules, status
- [ ] Rate limits: manual sync, folder list API

### Tests
- [ ] Connect → pick folder → manual sync → verify **search** results
- [ ] Same content in **chat** collection
- [ ] Project A Drive content never appears in Project B chat/search
- [ ] Backend-written staged file is readable by worker
- [ ] Drive sync does not block upload ingest, crawl jobs, chat, or search under load
- [ ] Re-sync unchanged file → no new embed (hash skip)
- [ ] Trash file in Drive → vectors removed
- [ ] Disconnect → vectors purged
- [ ] Overlapping manual + scheduled sync → only one `CONNECTOR_SYNC` runs

---

## Out of scope

- Gmail / ClickUp changes
- Per-user Google Drive ACL enforcement inside the same project (project-wise isolation is mandatory for v1)
- Real-time Drive push notifications (future)
