# Notion Connector — Implementation Plan (standalone)

**Status:** ✅ **Implemented** (2026)  
**Connector type:** `notion`  
**API prefix:** `/api/v1/connectors/notion`  
**Build order:** 2nd (after Google Drive)  
**Effort:** ~1.5–2 weeks (attachments + comments add ingest work)  
**Do not modify:** Gmail, ClickUp, or **Google Drive** code/tables

**Implementation reference:** Follow the **shipped Google Drive connector** — same framework usage, job flow, API route shape, UI lifecycle, and disconnect behavior. Copy Drive’s structure; swap Drive API calls for Notion API calls. Notion is a **separate, independent connector** (`connector_type=notion`).

| Drive (copy pattern) | Notion (your work) |
|----------------------|-------------------|
| `google_drive.py` | `notion.py` |
| `routes/connectors.py` (Drive router) | Add Notion router alongside (same endpoints, different prefix) |
| `GoogleDrivePanel.tsx` | `NotionPanel.tsx` |
| `useGoogleDrive.ts` | `useNotion.ts` |
| `googleDrive.ts` API client | `notion.ts` API client |

| Drive (do not copy blindly) | Notion difference |
|-----------------------------|-------------------|
| `GoogleDriveBrowseTree` (folder tree from `root`) | **Search/list picker** — Notion has no Drive-style folder hierarchy |
| `validate_connector_settings` (`max_files`, `max_size_mb`) | **`validate_notion_settings`** — Notion-specific limits |
| `resolve_oauth_credentials` Google env fallback | **UI credentials required** — no server env fallback for Notion |
| Google token refresh (library handles in memory) | **Persist rotated refresh token** on every Notion refresh |

---

## Goal

Let users connect Notion, pick pages/databases, and search that content in RAG chat and search.

Users do everything from the UI: credentials → Connect → pick sources → settings → index / scheduled sync. **No deploy for config.**

Same user story as Drive: connect external app → select what to index → content appears in chat and search.

---

## End-to-end flow (same as Drive)

```
User → Crawl / Integrations UI → Connect Notion → Pick pages/DBs → Index selected / auto-sync
                              ↓
              CONNECTOR_SYNC job (fetch only; one per integration at a time)
                              ↓
              Notion API: pages + blocks → plain text; file blocks → download; comments → append text
                              ↓
              Content-hash check → skip if unchanged (connector_documents row + UploadedDocument exists)
                              ↓
              DOCUMENT_INGEST job per page/row/attachment (connector priority, ingest caps)
                              ↓
              ingest_document_to_all_targets_sync → ChromaDB (search + chat)
                              ↓
              RAG chat + search
```

If durable job enqueue fails → **run sync inline in the API process** (same fallback as Drive).

---

## Shared framework (already shipped with Drive — reuse as-is)

### Database tables (existing — do not duplicate)

| Table | Purpose |
|-------|---------|
| `connector_integrations` | Per user + project + `connector_type`; encrypted tokens |
| `connector_project_credentials` | Per-project OAuth client ID/secret/redirect (**required for Notion**) |
| `connector_sources` | Selected pages/databases (JSON) — e.g. `{"pages": [], "databases": []}` |
| `connector_settings` | Cadence, limits, rules — **validate server-side** |
| `connector_sync_jobs` | Sync history, errors, counts (reuse `files_*` columns for pages) |
| `connector_documents` | **Required** — track external id, content hash, `document_id`, staging path |

### Schema v1 (no migration required)

Store Notion `page_id` (or composite row id) in the existing **`connector_documents.drive_file_id`** column. The column name is Drive-specific but the type/constraints work for any external string id. Unique key `(integration_id, drive_file_id)` applies as-is.

Store Notion metadata in `UploadedDocument.meta_data` (same as Drive):

```json
{
  "integration_id": "...",
  "notion_page_id": "...",
  "connector_type": "notion"
}
```

**Optional later:** migration to rename `drive_file_id` → `source_external_id` across connectors.

### Background job types

| Type | Role |
|------|------|
| `CONNECTOR_SYNC` | Fetch blocks, attachments, comments → text; enqueue one `DOCUMENT_INGEST` per page/row/attachment |
| `DOCUMENT_INGEST` | Existing job type — embed one staged file |

**Idempotency:** `connector_sync:{integration_id}` (same as Drive).  
**Priority / class:** `priority=-1`, `job_class=connector` via `enqueue_connector_sync` / `enqueue_connector_document_ingest`.

### Backend files

```
backend/app/services/connectors/notion.py          → Notion API client + run_notion_sync()
backend/app/routes/connectors.py                   → Add Notion router (mirror Drive routes)
backend/app/services/connectors/framework.py       → Notion constants + validate_notion_settings + count helper
backend/app/services/job_queue.py                  → Dispatch CONNECTOR_SYNC for connector_type=notion
backend/app/services/scheduler.py                  → Include notion in sync_connector_integrations
frontend/client/src/components/features/connectors/NotionPanel.tsx
frontend/client/src/components/features/connectors/NotionSourcePicker.tsx   ← search/list, NOT folder tree
frontend/client/src/hooks/useNotion.ts
frontend/client/src/services/api/notion.ts
frontend/client/src/pages/Crawl.tsx                 → Mount NotionPanel (same as GoogleDrivePanel)
```

### Framework wiring (explicit — required beyond copying Drive)

These files currently hardcode `google_drive` and **must be extended** for Notion:

| File | Change |
|------|--------|
| `job_queue.py` → `_process_connector_sync` | Dispatch `run_notion_sync` when `connector_type == "notion"` |
| `scheduler.py` → `sync_connector_integrations` | Query `connector_type == "notion"` integrations (in addition to Drive) |
| `framework.py` | Add `CONNECTOR_TYPE_NOTION`, `SOURCE_NOTION`, `validate_notion_settings()`, `count_indexed_notion_documents()` (or parameterize existing count by `source`) |
| `framework.py` → `resolve_oauth_credentials` | Notion path: read `connector_project_credentials` only — **no** `settings.google_*` fallback |

**Known scheduler quirk (v1 OK):** if **any** connector sync is `RUNNING`, the scheduler skips the whole tick for all connectors. Accept for v1; optional later fix: per-integration running check.

### Reuse from Drive / framework (mandatory)

| Pattern | Location |
|---------|----------|
| OAuth state + encryption | `security_utils.create_oauth_state`, `verify_oauth_state` |
| Credentials storage | `connector_project_credentials` via upsert credentials route |
| Sync job create + enqueue | `framework.create_sync_job`, `enqueue_connector_sync` |
| Per-item ingest enqueue | `framework.enqueue_connector_document_ingest` |
| Busy ingest deferral | `framework.ingest_pool_is_busy` |
| Rate limits | `framework.assert_connector_rate_limit`, `CONNECTOR_MANUAL_SYNC_LIMIT`, `CONNECTOR_BROWSE_LIMIT` |
| Staging path | `document_ingest_orchestration.staging_path_for_document` |
| Ingest all collections | via `DOCUMENT_INGEST` → `ingest_document_to_all_targets_sync` |
| Project owner check | `_ensure_project_owner` in Notion router (copy Drive pattern) |
| OAuth callback HTML | Origin-safe `postMessage({ type: 'connector_connected', connector: 'notion' }, APP_ORIGIN)` |
| Indexed count | Extend count helper for `UploadedDocument.source == "notion"` |

---

## Behavior rules (match Drive — not generic connect.md)

| Area | Requirement (same as Drive) |
|------|----------------------------|
| **Ingest** | Never `locked_ingest()` inside `CONNECTOR_SYNC`; always `DOCUMENT_INGEST` per page/row |
| **Targets** | `ingest_document_to_all_targets_sync` (search + chat) |
| **Dedup** | Content hash per stable Notion ID; skip when hash unchanged **and** `UploadedDocument` still exists |
| **Orphan recovery** | If `connector_documents` row exists but `UploadedDocument` was deleted → re-ingest |
| **Reconnect** | Match prior indexed doc by external id within same project |
| **Disconnect** | Revoke token if supported → delete `connector_integrations` row → **keep** indexed docs (no purge) |
| **Limits** | Server-enforce caps via `validate_notion_settings`; ignore bad client JSON |
| **Manual sync** | Rate limit per integration (`CONNECTOR_MANUAL_SYNC_LIMIT`) |
| **Browse/search API** | Rate limit per user (`CONNECTOR_BROWSE_LIMIT`) |
| **Queue fallback** | If `enqueue_connector_sync` fails → run `run_notion_sync` inline |
| **`is_active`** | Check each batch; stop mid-sync if paused |
| **Ingest deferral** | If ingest pool busy → stop batch, defer remainder to next sync |
| **Scheduler** | Same tick as Drive: cadence check, fan-out cap, stale job cleanup |

### Explicitly out of scope for v1 (Drive does not ship these either)

- Purge vectors on disconnect
- Delete/unshare/archived page sync
- Org-wide manual sync rate limit
- Secrets scan before ingest
- Staging review queue before index
- Notion webhooks / real-time sync

### Notion-specific (on top of Drive pattern)

| Area | Requirement |
|------|-------------|
| **Credentials** | **Must** be configured in UI per project — unlike Drive, there is no `settings.google_*` env fallback |
| **Token refresh** | Notion **rotates refresh tokens** — on every refresh, persist **both** new `access_token` and new `refresh_token` to `connector_integrations` (encrypted). On `invalid_grant`, mark integration ERROR and require reconnect |
| **Browse UX** | Search/list pages and databases shared with the integration — **not** a Drive-style folder tree from `root` |
| **API client** | Use `httpx` or `requests` (already in requirements) — no Notion SDK required for v1 |
| **API throttle** | Notion ~3 req/s — backoff on 429 with jitter |
| **Share reminder** | UI: *“Share pages with RAGSuite in Notion first.”* |
| **Block → text** | Headings, paragraphs, lists, tables, code → plain text; skip unsupported with log |
| **Attachments** | File blocks on pages (PDF, DOCX, TXT, etc.) — download + extract text; **one `DOCUMENT_INGEST` per file** (same pattern as Drive) |
| **Comments** | Page/block comments via Notion Comments API — append as text section on the parent page document (or separate doc if over size cap) |

### Rules

| Do | Don't |
|----|-------|
| Mirror Drive job/route/lifecycle structure | Modify Drive code or tables |
| Use existing connector tables | Modify Gmail/ClickUp tables |
| `DOCUMENT_INGEST` per page/row | Inline ingest in sync job |
| `validate_notion_settings` for Notion caps | Expose Drive `max_files` / `max_size_mb` in Notion UI |
| Store `page_id` in `drive_file_id` for v1 | Block v1 on a rename migration |
| Persist rotated Notion refresh tokens | Assume refresh token stays the same |
| Content-hash skip | Re-embed unchanged pages every sync |
| Keep indexed docs on disconnect | Purge on disconnect |

---

## Platform setup

1. Create **public** integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Set redirect URI: `{API_BASE}/api/v1/connectors/notion/auth/callback`
3. Users pick pages during OAuth **and/or** share additional pages with the integration afterward
4. Add the same redirect URI in Notion Developer portal

---

## Auth

| Item | Value |
|------|-------|
| Type | OAuth 2.0 (public integration) |
| Token endpoint | `POST https://api.notion.com/v1/oauth/token` (Basic auth: `client_id:client_secret`) |
| Access | Pages/databases shared with the integration |
| Token refresh | Yes — **save new access + refresh token on every refresh** |
| Credentials | **Required in UI** — `connector_project_credentials` per project (no server env fallback) |
| State | `create_oauth_state(provider="notion", user_id, project_id)` |
| Account label | Workspace name from OAuth response (or owner email) |

Store `access_token`, `refresh_token`, `token_expiry` encrypted on `connector_integrations` (same as Drive).

**Refresh implementation (required):**

```python
# POST /v1/oauth/token  grant_type=refresh_token
# Response includes new access_token AND new refresh_token — update both in DB
```

---

## What users sync

- **Pages** — block children → plain text
- **Database rows** — **one document per row** (one `DOCUMENT_INGEST` each)
- **Attachments on pages** — file blocks (PDF, DOCX, TXT, CSV, etc.): download, extract text, index (Drive-style; respect `max_size_mb` cap)
- **Comments** — discussion on pages/blocks: fetch via Comments API, convert to plain text, **merged into the page document** by default (toggle to skip)
- Skip unsupported block types / file types with log (same as Drive MIME skip)

**Stable IDs for dedup** (stored in `connector_documents.drive_file_id`):

| Item | ID pattern |
|------|------------|
| Page | `{page_id}` |
| Database row | `{page_id}:{row_id}` |
| Page attachment | `{page_id}:file:{block_id}` |
| Comments (merged) | `{page_id}:comments` (hash includes comment text) |

---

## Attachments & comments (in scope — v1)

### Attachments (like Drive files)

1. While walking blocks, detect `type: file` / `type: pdf` / external file blocks.
2. Resolve download URL from block payload (`file.file.url` or `file.external.url`).
3. Download with size cap (`max_size_mb` from settings); run `block_ssrf()` on external URLs.
4. Extract text (reuse existing ingest parsers: PDF, DOCX, TXT, CSV — same as uploads/Drive).
5. Stage file → `enqueue_connector_document_ingest` — **separate document per attachment** (title: page title + filename).
6. Skip images/video/audio unless setting enabled later; log skip reason.

### Comments (Q&A context)

1. After fetching a page, call **Retrieve comments** for that `page_id` (paginated).
2. Format each comment: author (if available), created time, plain text body.
3. **Default:** append a `--- Comments ---` section to the page’s staged text before hash/ingest (single document per page).
4. **Setting `include_comments: false`** — skip comment fetch entirely.
5. Cap comments per page (`max_comments_per_page`); truncate with log if exceeded.

### Settings toggles (UI + server)

| Setting | Default |
|---------|---------|
| `include_attachments` | `true` |
| `include_comments` | `true` |
| `max_size_mb` | `50` (per attachment, same cap style as Drive) |
| `max_attachments_per_page` | `20` |
| `max_comments_per_page` | `100` |

---

## Backend tasks

| Task | Details |
|------|---------|
| OAuth connect/callback/disconnect/status | Mirror Drive routes; Notion token exchange via `httpx`/`requests` |
| List/search sources | Notion Search API or list shared pages/DBs — rate-limited |
| Fetch page | `GET /pages/{id}` + paginated block children |
| Block → text | Convert blocks to plain text / markdown for staging |
| File blocks | Download attachment; extract text; separate ingest per file |
| Comments | `GET /v1/comments?block_id={page_id}` (paginated); merge into page text or skip via setting |
| Database rows | Query database; one staged file + one `DOCUMENT_INGEST` per row |
| Dedup | Stable ID in `connector_documents.drive_file_id`; SHA-256 content hash |
| SSRF guard | `block_ssrf()` on external attachment URLs before download |
| Ingest | Write staging file → `enqueue_connector_document_ingest` |
| Token refresh | Before API calls if expired; persist rotated tokens |
| Per-item errors | Log and continue |
| Disconnect | Revoke if possible → delete integration → **indexed content stays** |
| Scheduler | Extend existing tick; default cadence **30 min** |

### API routes (mirror Drive)

```
GET  /api/v1/connectors/notion/auth/start?project_id=
GET  /api/v1/connectors/notion/auth/callback
POST /api/v1/connectors/notion/credentials
GET  /api/v1/connectors/notion/credentials/status
GET  /api/v1/connectors/notion/status?project_id=
POST /api/v1/connectors/notion/disconnect
GET  /api/v1/connectors/notion/search?project_id=&query=          # rate limited — NOT folder browse
POST /api/v1/connectors/notion/sources
POST /api/v1/connectors/notion/settings
POST /api/v1/connectors/notion/sync                              # rate limited
GET  /api/v1/connectors/notion/jobs?project_id=
POST /api/v1/connectors/notion/pause
POST /api/v1/connectors/notion/resume
```

---

## UI tasks (mirror GoogleDrivePanel — with Notion-specific picker)

| Screen | Fields |
|--------|--------|
| Not connected | OAuth client ID, secret, redirect URI, “Connect Notion” (**all required**) |
| Connected | Workspace name, pages indexed, last sync, job status |
| Source picker | **`NotionSourcePicker`** — search + checkbox list of pages/databases (not a folder tree) |
| Actions | Refresh list, Index selected, Pause, Resume, Disconnect |
| Settings | Cadence, max pages/blocks/DB rows, **include attachments**, **include comments**, max attachment size |
| Help | *“Share pages with RAGSuite in Notion first.”* |
| Disconnect copy | Same as Drive: disconnect removes account link; indexed documents stay in project |

Mount on **`Crawl.tsx`** next to `GoogleDrivePanel`.

---

## Default limits (server-enforced — Notion-specific)

Use **`validate_notion_settings()`** — do not reuse Drive’s `max_files` / `max_size_mb` in the Notion UI.

| Setting | Default | Valid range (suggested) |
|---------|---------|-------------------------|
| Cadence | **30 minutes** | 5–1440 |
| Max pages per sync | 100 | 1–500 |
| Max blocks per page | 500 | 1–2000 |
| Max DB rows per sync | 100 | 1–500 |
| Max attachment size | **50 MB** | 1–200 (same style as Drive) |
| Max attachments per page | 20 | 1–50 |
| Max comments per page | 100 | 1–500 |
| Include attachments | `true` | bool |
| Include comments | `true` | bool |
| Manual sync rate limit | **6/min per integration** | `CONNECTOR_MANUAL_SYNC_LIMIT` |
| Search/list rate limit | **60/min per user** | `CONNECTOR_BROWSE_LIMIT` |

---

## Problems & fixes

| Problem | Fix |
|---------|-----|
| User forgot to share pages | Empty sync + clear UI message |
| Large databases | Row cap + paginate across sync runs |
| Unsupported block types | Skip + log |
| Notion 429 | Backoff + jitter |
| Duplicate on re-sync | Content-hash skip |
| `invalid_grant` on refresh | Mark ERROR; user must reconnect |
| Refresh token rotation missed | Always save new refresh_token from refresh response |
| Ingest pool saturated | `ingest_pool_is_busy` → defer to next sync |
| Enqueue failure | Inline sync fallback (same as Drive) |
| Attachment download fails | Log per file; continue page + other attachments |
| External file URL SSRF risk | `block_ssrf()` before download |
| Huge comment threads | Cap `max_comments_per_page`; truncate with log |
| PDF in Notion page | Download + existing PDF text extraction |

---

## Implementation checklist

Historical build checklist (kept for traceability). Core connector support is implemented.

### Schema
- [ ] v1: store Notion id in `connector_documents.drive_file_id` (no migration)
- [ ] Optional later: rename column to `source_external_id`

### Framework wiring
- [ ] `framework.py`: `CONNECTOR_TYPE_NOTION`, `SOURCE_NOTION`, `validate_notion_settings()`
- [ ] `framework.py`: count indexed docs for `source=notion`
- [ ] `job_queue.py`: dispatch `run_notion_sync` for `connector_type=notion`
- [ ] `scheduler.py`: schedule Notion integrations alongside Drive

### Backend
- [ ] Register Notion OAuth public integration
- [ ] `connectors/notion.py` — mirror `google_drive.py` structure
- [ ] Notion router in `routes/connectors.py`
- [ ] OAuth + **token refresh with rotation persisted**
- [ ] Block-to-text converter
- [ ] File block download + text extraction (PDF/DOCX/TXT; Drive-style)
- [ ] Comments fetch + merge into page text (toggle via `include_comments`)
- [ ] `block_ssrf()` on external attachment URLs
- [ ] Search/list sources API (rate limited)
- [ ] `run_notion_sync` — `CONNECTOR_SYNC` handler
- [ ] Per-page/row `enqueue_connector_document_ingest`
- [ ] Content-hash dedup + orphan recovery
- [ ] Disconnect: revoke + delete integration, **keep indexed docs**

### Frontend
- [ ] `NotionPanel.tsx` + **`NotionSourcePicker.tsx`** (search/list — not folder tree)
- [ ] `useNotion.ts` + `notion.ts` API client
- [ ] Mount on `Crawl.tsx`
- [ ] OAuth `postMessage` listener for `connector: 'notion'`
- [ ] Notion-specific settings (attachments + comments toggles, max size)

### Tests
- [ ] Token refresh persists new refresh_token
- [ ] Connect → pick page → manual sync → verify **search** + **chat**
- [ ] Re-sync unchanged page → no re-embed
- [ ] Disconnect → integration gone, indexed docs remain
- [ ] Orphan `connector_documents` → re-ingest on next sync
- [ ] Page with PDF attachment → searchable in chat + search
- [ ] Page with comments → comment text appears in RAG answer
- [ ] `include_comments: false` → comments excluded

---

## Out of scope

- Gmail / ClickUp / **Google Drive** code changes
- Purge on disconnect
- Delete sync when pages unshared/archived
- Notion webhooks
- Internal integration token in production multi-tenant
- Rename migration (optional later)
