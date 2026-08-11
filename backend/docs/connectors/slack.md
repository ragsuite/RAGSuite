# Slack Connector (standalone)

**Status:** ✅ **Implemented** (2026-07-08)  
**Connector type:** `slack`  
**API prefix:** `/api/v1/connectors/slack`  
**Router:** `app/routes/connectors_slack.py`  
**Service:** `app/services/connectors/slack.py`  
**Do not modify:** Gmail or ClickUp code/tables

> Backend sync auto-ingests channel history (like Drive/Notion). Product staging inbox remains a frontend/product follow-up. Live routes: [api-reference.md#connectors](../backend/api-reference.md#connectors).

---

## Goal

Let users connect Slack, pick channels, and search messages and files in RAG chat and search.

**Privacy v1:** No DMs. Public/private channels only if bot is invited.

---

## End-to-end flow

```
User → Integrations UI → Connect Slack → Pick channels → Set rules
                              ↓
              CONNECTOR_SYNC job (fetch only; one per integration at a time)
                              ↓
              Slack API: history + threads + files → formatted text
                              ↓
              STAGING (required v1) — user approves/dismisses
                              ↓
              DOCUMENT_INGEST per approved message/thread/file
                              ↓
              ingest_document_to_all_targets_sync → ChromaDB → RAG
```

---

## Shared framework (required)

### Database tables

| Table | Purpose |
|-------|---------|
| `connector_integrations` | Bot token (encrypted), workspace id |
| `connector_sources` | Selected channels (JSON) |
| `connector_settings` | Backfill depth, limits |
| `connector_sync_jobs` | History |
| `connector_staged_items` | **Required** — staging inbox (like Gmail) |
| Per-channel cursor | `latest_ts` per channel in settings or separate table |

### Job types

- `CONNECTOR_SYNC` — fetch messages/files → write staging rows only
- `DOCUMENT_INGEST` — after user approves staged item

**Idempotency:** `connector_sync:{integration_id}`.

### Backend files (shipped)

```
app/services/connectors/slack.py
app/routes/connectors_slack.py
# Frontend: channel picker + optional staging inbox (product follow-up)
```

### Reuse from codebase

| Pattern | Location |
|---------|----------|
| Staging approve/dismiss | Gmail inbox flow (`gmail` staged emails) |
| OAuth + encryption | `security_utils` |
| File download + extract | Drive/SharePoint document pipeline |
| SSRF | `block_ssrf()` on Slack file download URLs |
| Ingest | `ingest_document_to_all_targets_sync` |

### Production hardening (mandatory)

| Area | Requirement |
|------|-------------|
| **Staging required v1** | Never auto-index Slack messages |
| Two-phase jobs | Sync fetches only; ingest only after approve |
| `DOCUMENT_INGEST` | Per approved item |
| All collections | Search + chat |
| Dedup | `channel_id + message_ts` |
| Disconnect | Purge approved vectors + clear staging |
| Backfill approval | Explicit user approval for > 7 days history |
| Rate limits | Slack Tier 2/3 — throttle; 429 backoff |
| `block_ssrf` | On all file download URLs |
| Secrets/PII | Scan before staging; warn in UI |
| Manual sync caps | Per integration + org |
| OAuth `postMessage` | App origin only |
| AI safety | Informal/injected content — staging + prompt hardening |

### Rules

| Do | Don't |
|----|-------|
| Staging before index | Auto-index channel messages |
| Support DMs in v1 | Index DMs |
| `DOCUMENT_INGEST` after approve | Inline ingest in sync |
| Purge on disconnect | Leave Slack text in Chroma |

---

## Platform setup

1. Create app at [api.slack.com/apps](https://api.slack.com/apps)
2. **OAuth & Permissions** — bot token
3. Bot scopes (below)
4. Redirect URI + store **signing secret** (future Events API)
5. Install to workspace

---

## Auth

| Item | Value |
|------|-------|
| Type | OAuth 2.0 v2 (bot token) |
| Bot scopes | `channels:history`, `channels:read`, `groups:history`, `groups:read`, `files:read`, `users:read` |
| Private channels | `groups:*` + bot must be invited |
| Token refresh | Bot tokens long-lived; handle revocation |
| Credentials | Client ID, secret, signing secret in UI |
| State | `create_oauth_state(provider="slack", ...)` |

---

## What users sync

- Public channel messages + threads
- Private channels (bot member + scopes)
- Files shared in channels
- **Exclude: DMs** (v1)

---

## Backend tasks

| Task | Details |
|------|---------|
| OAuth connect/callback/disconnect | Slack OAuth v2 |
| List channels | `conversations.list` — joined channels only |
| Fetch history | `conversations.history` + `conversations.replies` |
| Fetch files | `files.info` + download URL → `block_ssrf` → extract text |
| Message → text | Format: `#channel`, user, timestamp, body |
| Incremental | Store latest `ts` per channel |
| Delete sync | Message deleted → remove vectors if already indexed |
| Dedup | `channel_id + message_ts` |
| Staging | **Required:** create `connector_staged_items`; no ingest until approve |
| Approve flow | Approve → stage temp file → `enqueue_document_ingest` |
| Dismiss flow | Mark dismissed; never ingest |
| Backfill | Default 7 days; full history needs explicit approval flag |
| Bot not in channel | Validate before sync; UI “invite bot” instructions |
| Edited messages | Re-fetch by `ts`; replace chunks if already indexed |
| Disconnect | Purge indexed + clear staging |

Optional later: **Events API** (verify signing secret).

### API routes (suggested)

```
GET  /api/connectors/slack/auth/start?project_id=
GET  /api/connectors/slack/auth/callback
POST /api/connectors/slack/credentials
GET  /api/connectors/slack/channels?project_id=
POST /api/connectors/slack/sources
POST /api/connectors/slack/sync
POST /api/connectors/slack/backfill/approve          # full history
GET  /api/connectors/slack/staging?project_id=
POST /api/connectors/slack/staging/{id}/approve
POST /api/connectors/slack/staging/{id}/dismiss
GET  /api/connectors/slack/status?project_id=
POST /api/connectors/slack/disconnect
```

---

## UI tasks

| Screen | Fields |
|--------|--------|
| Enable | Toggle |
| Credentials | Client ID, secret, signing secret |
| Connect | “Add to Slack” |
| Sources | Channel picker |
| Rules | Files on/off, thread depth, date range |
| Backfill | Approval UI for full history |
| Staging | Inbox: approve/dismiss (required) |
| Sync | Schedule, manual sync |
| Status | Messages staged vs indexed, errors |
| Warning | *“Slack may contain sensitive or informal content.”* |

---

## Default limits (server-enforced)

| Setting | Default |
|---------|---------|
| Cadence | 60 minutes |
| Max messages per sync | 200 |
| Backfill depth | 7 days (full history needs approval) |
| Max file size | 10 MB |
| Manual sync | 1/min per integration |
| DMs | Disabled |

---

## Problems & fixes

| Problem | Fix |
|---------|-----|
| Prompt injection in messages | Staging required; never auto-index |
| PII/secrets in messages | UI warning; secret scan; careful channel pick |
| Huge history cost | Backfill cap + approval |
| Bot not in channel | Validate + invite instructions |
| Slack 429 | Throttle + backoff |
| Informal content hurts RAG | Staging + channel curation |
| Edited messages | Re-sync by `ts` |
| File URL SSRF | `block_ssrf` |
| Sync blocks platform | Two-phase jobs; worker + Chroma HTTP |

---

## Implementation checklist

Historical build checklist (kept for traceability). Connector is implemented in this repo.

- [ ] Slack app + bot scopes
- [ ] `connectors/slack.py`
- [ ] OAuth routes (origin-safe `postMessage`)
- [ ] Channel picker API
- [ ] History + thread fetch
- [ ] File download + extract + SSRF check
- [ ] Staging tables + inbox UI (mirror Gmail pattern)
- [ ] Approve → `DOCUMENT_INGEST`; dismiss → skip
- [ ] Per-channel `ts` cursor
- [ ] Backfill approval flow
- [ ] `CONNECTOR_SYNC` (fetch → staging only)
- [ ] Disconnect purge
- [ ] E2E: sync → stage → approve → search + chat
- [ ] E2E: dismiss → never appears in RAG

---

## Out of scope

- DMs
- Gmail / ClickUp
- Real-time Events API (v1)
- Auto-index without staging
