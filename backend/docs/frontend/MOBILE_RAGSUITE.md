# frontend (Server workspace) — Agent Orientation (Backend Repo Mirror)

**Last updated:** 2026-07-15  
**Canonical UI path:** `/Users/arun/RAGSuite_Server/frontend` (implement UI **only** under this tree — separate git)  
**This file:** Orientation for agents whose Cursor root is `RAGSuite_Server/backend`. For dual-repo tasks, edit mobile files via this absolute path **without** merging workspaces/git.

---

## What it is

Cross-platform **admin client** for RAGSuite (Expo SDK ~55, React Native, Expo Router, TypeScript). Ships **web as first-class** (permanent drawer) plus iOS/Android.

| Local pair | Value |
|------------|--------|
| Expo web | **`http://localhost:9091`** |
| Backend API | `http://localhost:9090` |
| Backend `FRONTEND_BASE_URL` | **`http://localhost:9091`** |

Product docs inside that repo: `AI_PROJECT_MEMORY.md`, `PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, `AGENTS.md` (brand).

---

## How it talks to this backend

| Concern | frontend (Server workspace) behavior | Compatible? |
|---------|--------------------------|-------------|
| Base URL | `env.json` → `API_URL` **origin** | ✅ `http://localhost:9090` |
| Auth | Bearer JWT from login / SSO hydrate | ✅ |
| Cookies | Not relied on for admin (cross-origin) | ✅ Optional |
| Paths | `/api/v1/...` via `apiUrl.ts` | ✅ |
| Document preview | `buildApiUrl` + content / content-stream / blob | ✅ Must **not** use Expo origin |

---

## Layout (high signal)

```text
frontend (Server workspace)/
├── src/app/                 # Expo Router
├── src/features/            # Domain modules (crawl, org, auth, …)
├── src/network/
│   ├── apiUrl.ts
│   ├── request.ts           # Axios + Bearer
│   └── actions/*.actions.ts
├── envs/
└── tokens/ + AGENTS.md
```

Present domains include: auth (password + SSO callback), onboarding, projects, **organization**, crawl, documents, gmail, google-drive, notion, chatbot, search, analytics, audit, feedback, notifications, system-health, settings, profile, embedding, configuration, compare-models, …

**Still thin / absent UI:** Confluence, SharePoint, Slack, ClickUp; prefer consuming `public-config` for signup/SSO gating.

---

## Auth flows

### Password

```text
POST /api/v1/crawl/auth/login
  → 2FA if required
  → store access_token → Authorization: Bearer
App boot → GET /api/v1/crawl/auth/verify
```

### Google SSO (web)

```text
Full-page GET /api/v1/auth/sso/start?org_slug=…
  → Google → backend callback
  → redirect FRONTEND_BASE_URL/login/callback?success=1#access_token=…&…
  → client persists Bearer (cookie alone fails cross-origin :9090 ↔ :9091)
  → org admins may land on organization routes via redirect_path
```

---

## Crawl connectors (UI tabs)

`domain` | `document` | `gmail` | `google-drive` | `notion`

Backend also has Confluence, SharePoint, Slack — [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md) G5.

---

## Documents panel (known behaviors)

| Topic | Behavior |
|-------|----------|
| Preview | API-origin stream/blob; Gmail / `txt` as text |
| Embedding column | May show “None” until coverage refresh (`skip_cache`) |
| Reindex | POST project reindex with `document_ids`; progress via reindex-progress |

---

## Brand / UI rules (when advising mobile work)

Follow frontend (Server workspace) `AGENTS.md` brand tokens — do not invent a second design system in the backend repo.

---

## What backend agents must NOT assume

| Assumption | Reality |
|------------|---------|
| “Frontend uses cookies only” | mobile uses Bearer |
| “FRONTEND_BASE_URL is :9091” | Target Expo web is **:9091** |
| “Team / SSO pages missing” | Present (keep docs/gaps updated if regressing) |
| “All five connectors have UI” | Drive + Notion + Gmail (+ domain/docs) |
| “This Cursor workspace includes mobile” | **No** — open mobile separately |
| “Parity doc = backend compatibility” | `WEB_MOBILE_PARITY.md` compares UIs |

---

## Local pairing

```bash
# Workspace A — RAGSuite_Server/backend
./start.sh
# FRONTEND_BASE_URL=http://localhost:9091

# Workspace B — frontend (Server workspace) (separate)
yarn env:local && yarn web   # :9091
```
