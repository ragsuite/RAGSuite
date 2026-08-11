# Connector Integration

Content connectors sync external apps into RAG chat and search via `CONNECTOR_SYNC` → `DOCUMENT_INGEST`.

**Backend API:** [../backend/api-reference.md#connectors](../backend/api-reference.md#connectors)  
**Archived build checklist:** [../backend/future/connectors.md](../backend/future/connectors.md)

---

## Implementation status (2026-07)

| Connector | Status | API prefix |
|-----------|--------|------------|
| **Google Drive** | ✅ Implemented | `/api/v1/connectors/google_drive` |
| **Notion** | ✅ Implemented | `/api/v1/connectors/notion` |
| **Confluence** | ✅ Implemented | `/api/v1/connectors/confluence` |
| **SharePoint** | ✅ Implemented | `/api/v1/connectors/sharepoint` |
| **Slack** | ✅ Implemented | `/api/v1/connectors/slack` |
| Gmail, ClickUp | ✅ Legacy (unchanged) | `/api/v1/gmail`, `/api/v1/clickup` |

**Shared framework:** ✅ `connector_*` tables, `services/connectors/framework.py`, job types `CONNECTOR_SYNC` + `DOCUMENT_INGEST`.

**Smoke:** `.venv/bin/python scripts/smoke_connectors.py` (API on `:9090`).

**Frontend UI:** Drive, Notion, Gmail, Confluence, SharePoint, and Slack panels are available in the frontend (Server workspace). Track residual UX polish in [../frontend/COMPATIBILITY_GAPS.md](../frontend/COMPATIBILITY_GAPS.md).

---

## Per-connector docs

| Connector | File | Router | Service |
|-----------|------|--------|---------|
| Google Drive | [google-drive.md](./google-drive.md) | `routes/connectors.py` | `google_drive.py` |
| Notion | [notion.md](./notion.md) | `routes/connectors_notion.py` | `notion.py` |
| Confluence | [confluence.md](./confluence.md) | `routes/connectors_confluence.py` | `confluence.py` |
| SharePoint | [sharepoint.md](./sharepoint.md) | `routes/connectors_sharepoint.py` | `sharepoint.py` |
| Slack | [slack.md](./slack.md) | `routes/connectors_slack.py` | `slack.py` |

**Out of scope:** Do not modify Gmail or ClickUp.

---

## How it works

```text
User → UI → Connect app → Pick sources → Set rules
                    ↓
        CONNECTOR_SYNC (fetch only; one per integration)
                    ↓
        Download/export → staging → content-hash skip
                    ↓
        DOCUMENT_INGEST per file (ingest caps + fair queue)
                    ↓
        ingest_document_to_all_targets_sync → ChromaDB → RAG
```

---

## Shared framework (implemented)

| Piece | Location |
|-------|----------|
| Tables | `connector_integrations`, `connector_sources`, `connector_settings`, `connector_sync_jobs`, `connector_documents` |
| Service | `app/services/connectors/framework.py` |
| Routers | `app/routes/connectors*.py` (Drive + four platform routers) |
| Scheduler | `sync_connector_integrations` every 5 min |

### Production hardening (required at scale)

- Two-phase jobs — no inline ingest in sync
- Idempotency: `connector_sync:{integration_id}`
- Server-enforced `max_files` / `max_pages` / `max_messages`, `max_size_mb`, cadence
- `block_ssrf()` on download URLs (Slack / SharePoint)
- Purge on disconnect via `PURGE_CONNECTOR_INTEGRATION`
- `CHROMA_MODE=http` + worker process for multi-replica

---

## Rules

| Do | Don't |
|----|-------|
| Config in UI/DB | Hardcode in `.env` |
| Use connector tables | Change Gmail/ClickUp |
| Enqueue `DOCUMENT_INGEST` | Ingest inside `CONNECTOR_SYNC` |
| Encrypt tokens | Store plain text |
| Owner check on project | Assume any project member can manage |

---

## Future: org-level connector policy

When org ACL expands, org admins may control which connector types members may use — see [organization architecture](../planned/organization-architecture.md).

---

## Roadmap

See [../planned/README.md](../planned/README.md) (enterprise SSO/SAML and SCIM remain).
