# SharePoint Connector (standalone)

**Status:** ✅ **Implemented** (2026-07-08)  
**Connector type:** `sharepoint`  
**API prefix:** `/api/v1/connectors/sharepoint`  
**Router:** `app/routes/connectors_sharepoint.py`  
**Service:** `app/services/connectors/sharepoint.py`  
**Do not modify:** Gmail or ClickUp code/tables

> Architecture notes below remain useful for hardening and frontend work. Live routes: [api-reference.md#connectors](../backend/api-reference.md#connectors).

---

## Goal

Let users connect SharePoint / Microsoft 365, pick sites and document libraries, and search files in RAG chat and search.

---

## End-to-end flow

```
User → Integrations UI → Connect Microsoft → Pick sites/libraries → Set rules
                              ↓
              CONNECTOR_SYNC job (fetch only; one per integration at a time)
                              ↓
              Microsoft Graph: list + download files → staging
                              ↓
              Content-hash check (eTag) → skip if unchanged
                              ↓
              DOCUMENT_INGEST per file
                              ↓
              ingest_document_to_all_targets_sync → ChromaDB → RAG
```

---

## Shared framework (required)

### Database tables

| Table | Purpose |
|-------|---------|
| `connector_integrations` | Tokens, tenant_id, status |
| `connector_sources` | Sites + libraries (JSON) |
| `connector_settings` | Limits — server-validated |
| `connector_sync_jobs` | History + delta token storage |
| `connector_documents` (optional) | `driveItem.id`, eTag, content hash |

### Job types

- `CONNECTOR_SYNC` — Graph list/download only
- `DOCUMENT_INGEST` — per file

**Idempotency:** `connector_sync:{integration_id}`.

### Backend files (shipped)

```
app/services/connectors/sharepoint.py   # Graph client
app/routes/connectors_sharepoint.py
# Frontend panel: external SPA (mirror Drive file browse)
```

### Reuse from codebase

| Pattern | Location |
|---------|----------|
| OAuth + encryption | `security_utils` |
| File download + ingest | Same pattern as Google Drive connector |
| `block_ssrf` | On any redirect/download URLs |
| Ingest all targets | `ingest_document_to_all_targets_sync` |

### Production hardening (mandatory)

| Area | Requirement |
|------|-------------|
| Two-phase jobs | No inline ingest in sync |
| Hash skip | `eTag` + content hash |
| Disconnect purge | By `integration_id` |
| Server caps | max files, size, cadence |
| Graph throttling | Honor `Retry-After` on 429 |
| Admin consent UX | Detect `admin_consent_required` |
| Manual sync limits | Per integration + org |
| OAuth `postMessage` | App origin only |
| Infra | Chroma HTTP, worker process, Redis |

### Rules

New tables only; `DOCUMENT_INGEST` per file; no Gmail/ClickUp changes; purge on disconnect.

---

## Platform setup

1. Register app in **Azure AD** (Entra ID)
2. **Microsoft Graph** delegated permissions
3. Redirect URI: `{API_BASE}/api/connectors/sharepoint/auth/callback`
4. Enterprise tenants: **admin consent** often required

---

## Auth

| Item | Value |
|------|-------|
| Type | OAuth 2.0 via Microsoft identity platform |
| Scopes | `Sites.Read.All`, `Files.Read.All` (delegated) — document least-privilege in UI |
| Token refresh | Yes |
| Credentials | Client ID, secret, **tenant ID** in UI |
| Admin consent | Detect error; show IT admin wizard + consent URL |
| State | `create_oauth_state(provider="sharepoint", ...)` |

---

## What users sync

- SharePoint sites
- Document libraries (drives)
- Files: PDF, DOCX, XLSX, PPTX, TXT, etc.
- Exclude: large media (configurable)

---

## Backend tasks

| Task | Details |
|------|---------|
| OAuth connect/callback/disconnect | MS identity platform |
| Admin consent flow | Handle `admin_consent_required`; link to admin approval |
| List sites | `GET /sites?search=*` or followed sites |
| List libraries | `GET /sites/{id}/drives` |
| List/download files | Drive item APIs |
| Incremental sync | **Delta queries** (`/delta`) with stored token |
| Delete sync | Delta delete → remove vectors by `source_id` |
| Dedup | `driveItem.id` + `eTag` + content hash |
| Permission errors | Skip forbidden files; log per file |
| Multi-geo | Use tenant-appropriate Graph endpoint |
| Ingest | Stage → `enqueue_document_ingest` |
| Disconnect | Purge job |

### API routes (suggested)

```
GET  /api/connectors/sharepoint/auth/start?project_id=
GET  /api/connectors/sharepoint/auth/callback
POST /api/connectors/sharepoint/credentials          # includes tenant_id
GET  /api/connectors/sharepoint/admin-consent-url
GET  /api/connectors/sharepoint/sites?project_id=
GET  /api/connectors/sharepoint/libraries?site_id=
POST /api/connectors/sharepoint/sources
POST /api/connectors/sharepoint/sync
GET  /api/connectors/sharepoint/status?project_id=
POST /api/connectors/sharepoint/disconnect
```

---

## UI tasks

| Screen | Fields |
|--------|--------|
| Enable | Toggle |
| Credentials | Client ID, secret, tenant ID |
| Connect | “Connect Microsoft” |
| Admin setup | Wizard when consent needed |
| Sources | Site + library picker |
| Rules | File types, max size, max files |
| Sync | Schedule, manual sync |
| Status | Last sync, errors, delta token health |

---

## Default limits (server-enforced)

| Setting | Default |
|---------|---------|
| Cadence | 60 minutes |
| Max files per sync | 100 |
| Max file size | 50 MB |
| Manual sync | 1/min per integration |

---

## Problems & fixes

| Problem | Fix |
|---------|-----|
| Admin consent required | Dedicated wizard + docs for IT |
| Graph throttling | Backoff; batch; jitter schedule |
| Huge libraries | File cap + delta-only incremental |
| Permission change mid-sync | Per-file skip |
| Deleted files in search | Delta delete → purge vectors |
| Cost / re-embed | eTag + content hash skip |
| Sync blocks app | Two-phase jobs; Chroma HTTP |

---

## Implementation checklist

Historical build checklist (kept for traceability). Connector is implemented in this repo.

- [ ] Azure AD app + Graph permissions
- [ ] `connectors/sharepoint.py` Graph client
- [ ] OAuth + admin consent handling
- [ ] Site/library picker APIs
- [ ] Delta sync cursor persistence
- [ ] `CONNECTOR_SYNC` + per-file `DOCUMENT_INGEST`
- [ ] Hash skip + delete sync
- [ ] Disconnect purge
- [ ] UI: picker + admin wizard
- [ ] E2E with test tenant: search + chat

---

## Out of scope

- Gmail / ClickUp
- SharePoint on-prem only
- Narrowing Graph scopes to selected sites only (future hardening)
