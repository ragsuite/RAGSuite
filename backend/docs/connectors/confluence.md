# Confluence Connector (standalone)

**Status:** ✅ **Implemented** (2026-07-08)  
**Connector type:** `confluence`  
**API prefix:** `/api/v1/connectors/confluence`  
**Router:** `app/routes/connectors_confluence.py`  
**Service:** `app/services/connectors/confluence.py`  
**Do not modify:** Gmail or ClickUp code/tables

> Architecture notes below remain useful for hardening and frontend work. Live routes: [api-reference.md#connectors](../backend/api-reference.md#connectors).

---

## Goal

Let users connect Confluence Cloud, pick wiki spaces, and search pages in RAG chat and search.

---

## End-to-end flow

```
User → Integrations UI → Connect Confluence → Pick spaces → Set rules
                              ↓
              CONNECTOR_SYNC job (fetch only; one per integration at a time)
                              ↓
              Confluence API v2: pages + optional attachments
                              ↓
              HTML/storage → plain text → staging file
                              ↓
              Content-hash check → skip if unchanged
                              ↓
              DOCUMENT_INGEST per page (optional staging approval first)
                              ↓
              ingest_document_to_all_targets_sync → ChromaDB → RAG
```

---

## Shared framework (required)

### Database tables

| Table | Purpose |
|-------|---------|
| `connector_integrations` | Tokens, status, `connector_type=confluence` |
| `connector_sources` | Selected spaces (JSON) |
| `connector_settings` | Limits, rules — server-validated |
| `connector_sync_jobs` | Run history |
| `connector_staged_items` (optional) | Review before index — **recommended** |

### Job types

- `CONNECTOR_SYNC` — fetch only
- `DOCUMENT_INGEST` — embed after staging approve (or auto if staging off)

**Idempotency:** `connector_sync:{integration_id}`.

### Backend files (shipped)

```
app/services/connectors/confluence.py
app/routes/connectors_confluence.py
# Frontend panel: external SPA (mirror Drive/Notion UI)
```

### Reuse from codebase

| Pattern | Location |
|---------|----------|
| OAuth + encryption | `security_utils` |
| Ingest pipeline | `document_ingest_orchestration.ingest_document_to_all_targets_sync` |
| Document extract | Existing PDF/DOCX pipeline for attachments |
| Staging UI pattern | Gmail inbox (approve/dismiss) — adapt for wiki pages |

### Production hardening (mandatory)

| Area | Requirement |
|------|-------------|
| Two-phase fetch/ingest | No inline `locked_ingest` in sync |
| All search + chat targets | `ingest_document_to_all_targets_sync` |
| Content hash + version | Skip unchanged pages |
| **Staging recommended** | Wiki HTML = prompt-injection risk |
| Disconnect purge | By `integration_id` |
| Server limits | `max_pages`, attachment size, cadence |
| Rate limit | Backoff on 429 |
| OAuth `postMessage` | App origin only |
| Ops logging | `integration_id`, `sync_job_id` |

### Rules

Same as other connectors: new tables only, `DOCUMENT_INGEST` per page, server caps, purge on disconnect, no Gmail/ClickUp changes.

---

## Platform setup

1. App in [Atlassian Developer Console](https://developer.atlassian.com/)
2. **Confluence Cloud REST API v2** only (self-hosted out of scope v1)
3. OAuth 2.0 (3LO) redirect URI
4. Optional dev-only: API token + email (single site) — not for multi-tenant prod

---

## Auth

| Item | Value |
|------|-------|
| Type | OAuth 2.0 (3LO) |
| Scopes | `read:confluence-content.all`, `read:confluence-space.summary` |
| Token refresh | Yes |
| Credentials | Atlassian client ID/secret in UI |
| State | `create_oauth_state(provider="confluence", ...)` |

---

## What users sync

- Wiki pages (body)
- Blog posts in selected spaces
- Attachments (PDF, DOCX) — optional
- Per **space** multi-select

---

## Backend tasks

| Task | Details |
|------|---------|
| OAuth connect/callback/disconnect | Atlassian 3LO |
| List spaces | `GET /wiki/api/v2/spaces` (paginated) |
| List pages | Per space, paginated |
| Fetch body | `GET /wiki/api/v2/pages/{id}` — prefer storage format for macros |
| HTML → text | Safe strip; handle common Confluence macros |
| Attachments | Download → existing document extract → stage → ingest |
| Incremental | `version.number` or `lastModified` cursor |
| Delete sync | Page deleted → remove vectors |
| Dedup | `page_id` + content hash |
| Staging | **Recommended:** queue page text; user approves → then `DOCUMENT_INGEST` |
| Ingest | Stage file → `enqueue_document_ingest` |
| Per-page errors | One bad page must not fail whole space sync |

### API routes (suggested)

```
GET  /api/connectors/confluence/auth/start?project_id=
GET  /api/connectors/confluence/auth/callback
POST /api/connectors/confluence/credentials
GET  /api/connectors/confluence/spaces?project_id=
POST /api/connectors/confluence/sources
POST /api/connectors/confluence/sync
GET  /api/connectors/confluence/staging?project_id=      # if staging enabled
POST /api/connectors/confluence/staging/{id}/approve
POST /api/connectors/confluence/staging/{id}/dismiss
POST /api/connectors/confluence/disconnect
```

---

## UI tasks

| Screen | Fields |
|--------|--------|
| Enable | Toggle |
| Credentials | Atlassian client ID/secret |
| Connect | “Connect Confluence” |
| Sources | Space multi-select |
| Rules | Attachments on/off, max pages per sync |
| Staging | Inbox: approve/dismiss pages (recommended) |
| Sync | Schedule, manual sync |
| Status | Last sync, errors |

---

## Default limits (server-enforced)

| Setting | Default |
|---------|---------|
| Cadence | 60 minutes |
| Max pages per sync | 100 |
| Max attachment size | 25 MB |
| Manual sync | 1/min per integration |

---

## Problems & fixes

| Problem | Fix |
|---------|-----|
| Macros break extraction | Storage format + dedicated parser |
| Prompt injection in wiki | Staging + hardened system prompt |
| Huge spaces | Page cap; continue next sync |
| 429 rate limits | Backoff + jitter |
| Deleted pages in RAG | Delete vectors on removal |
| Self-hosted Confluence | Out of scope v1 |

---

## Implementation checklist

Historical build checklist (kept for traceability). Connector is implemented in this repo.

- [ ] Atlassian OAuth app
- [ ] `connectors/confluence.py`
- [ ] OAuth routes
- [ ] Space + page APIs
- [ ] HTML-to-text
- [ ] Attachment download (optional)
- [ ] `CONNECTOR_SYNC` + `DOCUMENT_INGEST`
- [ ] Staging tables + UI (recommended)
- [ ] Incremental cursor + hash skip
- [ ] Disconnect purge
- [ ] E2E: space → sync → search + chat

---

## Out of scope

- Confluence Server/Data Center
- Gmail / ClickUp
