# Microsoft Teams Connector (standalone)

**Status:** ✅ **Implemented** (v1 — channel messages)  
**Connector type:** `teams`  
**API prefix:** `/api/v1/connectors/teams`  
**Router:** `app/routes/connectors_teams.py`  
**Service:** `app/services/connectors/teams.py`  
**Do not modify:** Gmail or ClickUp code/tables · existing SharePoint/Slack integrations

> Live routes: [api-reference.md#connectors](../backend/api-reference.md#connectors).

---

## Goal

Let users connect Microsoft Teams via Entra ID (Azure AD), pick teams and channels, and search **channel messages** (plus optional thread replies) in RAG chat and search.

**Privacy v1:** No 1:1/group chats. No meeting transcripts. No channel file attachments (use SharePoint for files).

---

## End-to-end flow

```
User → Crawl → Teams → Connect Microsoft → Pick teams/channels → Set rules
                              ↓
              CONNECTOR_SYNC job (fetch only; one per integration at a time)
                              ↓
              Microsoft Graph: channel messages (+ replies) → formatted text
                              ↓
              Content-hash check → DOCUMENT_INGEST per changed message
                              ↓
              ingest → ChromaDB → RAG
```

---

## Shared framework

Uses existing `connector_*` tables with `connector_type = "teams"` (no migration).

| Table | Purpose |
|-------|---------|
| `connector_integrations` | Encrypted tokens, status |
| `connector_sources` | Selected teams + channels (JSON) |
| `connector_settings` | Cadence, max_messages, include_threads |
| `connector_sync_jobs` | History |
| `connector_documents` | Dedup by `team_id:channel_id:message_id` |

**Jobs:** `CONNECTOR_SYNC` → enqueue `DOCUMENT_INGEST`  
**Idempotency:** `connector_sync:{integration_id}`

---

## Auth (Entra / Graph)

| Item | Detail |
|------|--------|
| Tenant | `common` (same pattern as SharePoint) |
| Scopes | `offline_access`, `User.Read`, `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All` |
| Redirect | `https://<api-host>/api/v1/connectors/teams/auth/callback` |
| Credentials | Per-project UI (separate from SharePoint) |

`ChannelMessage.Read.All` often requires **admin consent** in the tenant.

---

## Sources JSON

```json
{
  "teams": [{ "id": "...", "name": "..." }],
  "channels": [{ "id": "...", "name": "...", "team_id": "..." }]
}
```

## Settings

| Key | Default | Notes |
|-----|---------|-------|
| `cadence_minutes` | 30 | Clamped 5–1440 |
| `max_messages` | 200 | Clamped 1–1000 |
| `max_size_mb` | 10 | Reserved / clamp parity |
| `include_threads` | true | Graph message replies |

**Backfill window (v1):** last 7 days (Slack-style).

---

## Browse API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/teams` | Joined teams for the connected user |
| GET | `/channels?team_id=` | Channels in a team |

---

## Out of scope (later)

- Chats (`Chat.Read`)
- Meeting transcripts
- Channel file attachments (`Files.Read.All`)
- Reusing SharePoint project credentials
- Staging inbox

---

## Frontend

- Tab: Crawl → **Teams**
- Panel: `CrawlTeamsPanel.tsx`
- Hook: `useTeamsConnector.ts`
- OAuth redirect helper: `teams-oauth.ts`
