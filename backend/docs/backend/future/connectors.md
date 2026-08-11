# Connectors — Backend Specification (archived)

**Status:** ✅ **Shipped** (Confluence, SharePoint, Slack — 2026-07-08)  
**Also shipped:** Google Drive, Notion  
** Canonical API:** [../api-reference.md#connectors](../api-reference.md#connectors) · Product index: [../../connectors/README.md](../../connectors/README.md)

> This file was the build checklist. Keep it as a historical reference; prefer the shipped API docs above for new work.

---

## Reference implementation (all five)

| Piece | Google Drive | Notion | Confluence | SharePoint | Slack |
|-------|--------------|--------|------------|------------|-------|
| Router | `routes/connectors.py` | `routes/connectors_notion.py` | `routes/connectors_confluence.py` | `routes/connectors_sharepoint.py` | `routes/connectors_slack.py` |
| Service | `services/connectors/google_drive.py` | `notion.py` | `confluence.py` | `sharepoint.py` | `slack.py` |
| Prefix | `/api/v1/connectors/google_drive` | `/notion` | `/confluence` | `/sharepoint` | `/slack` |
| Browse | `GET /browse`, `/folders` | `GET /search` | `GET /spaces` | `GET /sites`, `/drives` | `GET /channels` |

**Do not modify** Gmail or ClickUp.

---

## Standard API surface

**Prefix:** `/api/v1/connectors/{connector_type}`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/auth/start` | `{ auth_url }` |
| GET | `/auth/callback` | Public; HTML postMessage |
| POST | `/credentials` | Encrypted OAuth app creds |
| GET | `/credentials/status` | `{ configured: bool }` |
| GET | `/status` | Integration or null |
| POST | `/sources` | Platform-specific JSON |
| POST | `/settings` | Server-validated limits |
| POST | `/sync` | Enqueue `CONNECTOR_SYNC` |
| GET | `/jobs` | Sync job history |
| POST | `/pause` / `/resume` / `/disconnect` | Lifecycle |

**Auth:** `get_current_user_required` + project **owner** check (`_ensure_project_owner`).  
**Rate limits:** `assert_connector_rate_limit` — manual sync 6/min, browse 60/min.

---

## Worker flow

```text
CONNECTOR_SYNC
  → platform list/download → DOCUMENT_STAGING_DIR
  → content hash (connector_documents)
  → DOCUMENT_INGEST per changed item
  → update ConnectorSyncJob counts
```

**Payload:** `{ "connector_type", "integration_id", "project_id", "user_id" }`  
**Idempotency:** `connector_sync:{integration_id}`

Scheduler: `scheduler.sync_connector_integrations` includes all five types.

---

## Platform notes (shipped)

### Confluence (`confluence`)

| Item | Detail |
|------|--------|
| Auth | Atlassian OAuth 2.0 |
| Sources | `{ "spaces": [...], "pages": [...] }` |
| Browse | `GET /spaces` |
| Settings | `validate_confluence_settings` — `max_pages`, `max_size_mb`, cadence |
| Sync | Pages → HTML/text extract → ingest |

### SharePoint (`sharepoint`)

| Item | Detail |
|------|--------|
| Auth | Microsoft Entra (common tenant) OAuth |
| Sources | `{ "sites": [...], "drives": [...] }` |
| Browse | `GET /sites`, `GET /drives` |
| Settings | Drive-like — `max_files`, `max_size_mb` |
| Sync | Graph download → PDF/DOCX extract |

### Slack (`slack`)

| Item | Detail |
|------|--------|
| Auth | Slack OAuth v2 |
| Sources | `{ "channels": [...], "include_threads": bool }` |
| Browse | `GET /channels` |
| Settings | `validate_slack_settings` — `max_messages`, cadence |
| Sync | Channel history (+ optional threads) → auto-ingest (staging UI is frontend/product follow-up) |

---

## Database

Reuse existing tables — `connector_type` ∈ `google_drive` \| `notion` \| `confluence` \| `sharepoint` \| `slack`.

---

## Smoke / tests

```bash
pytest tests/test_connectors_framework.py tests/test_notion_settings.py tests/test_google_drive_sync.py -q
.venv/bin/python scripts/smoke_connectors.py   # needs API on :9090
```

**Product docs:** [confluence.md](../../connectors/confluence.md) · [sharepoint.md](../../connectors/sharepoint.md) · [slack.md](../../connectors/slack.md)
