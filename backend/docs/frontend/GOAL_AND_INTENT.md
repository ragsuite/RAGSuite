# Goal & Intent — Frontend Compatibility

**Last updated:** 2026-07-15
**Parent:** [README.md](./README.md)

---

## Why this work exists

1. **Historical compatibility:** `RAGSuite_Server/backend` was validated end-to-end against the Vite SPA at `/Users/arun/Desktop/RAGSUITE/frontend` (cookie session, `withCredentials`, Vite proxy to `/api/v1`).
2. **Product upgrade:** The admin UI is moving to **frontend (Server workspace)** (`/Users/arun/RAGSuite_Server/frontend`) — one Expo codebase for web + native, brand system (`AGENTS.md`), feature-module layout.
3. **Backend ahead of UI (remaining):** Confluence / SharePoint / Slack connector **panels** are still missing in frontend (Server workspace). Organization admin and Google OIDC SSO are shipped in the API **and** largely wired in mobile (Team UI + Bearer SSO hydrate). Legacy Vite SPA still lacks org/SSO screens.
4. **Partial success today:** Password login, projects, crawl, documents, Gmail, Drive, Notion, chatbot/search config, analytics, audit, feedback, and in-app chat largely work from frontend (Server workspace) against this backend when `API_URL` points at `:9090` (or a tunnel).

---

## Goal (success criteria)

When complete:

1. **frontend (Server workspace)** is the **primary** admin client for this backend (web + mobile).
2. Every **shipped** backend capability that operators need has a matching UI/network path in frontend (Server workspace) — or is explicitly deferred in [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md) with rationale.
3. Backend remains a **dual-client** API:
   - **Cookie session** (legacy SPA / credentialed web) still works.
   - **Bearer JWT** (frontend (Server workspace)) remains first-class — `app/auth.py` already accepts Bearer **or** cookie.
4. No breakage of standalone layout, ports (`8002` / `6380` / `8003`), org model, connector framework, or job queue.

---

## Why document in the *backend* repo

- Agents in this repo must know which client is authoritative and which gaps are **client-side** vs **API-side**.
- Prevents wrong assumptions (e.g. “org UI exists”, “SSO is in mobile”, “only cookies are supported”).
- Gives a single place for **intent and ordered plan** before any code lands in either repo.
- Frontend source of truth for UI still lives in frontend (Server workspace)’s own docs; this folder is the **backend ↔ frontend bridge**.

---

## Non-negotiable constraints

| Constraint | Rationale |
|------------|-----------|
| **Docs / skills here; no drive-by API redesign** | Architecture is stable; gaps are mostly client consumption |
| **Do not remove cookie auth** | Legacy SPA and OAuth redirect flows still rely on it |
| **Do not require cookies for mobile** | Expo / native must keep Bearer + SecureStore |
| **Login-only org mode** | `ALLOW_PUBLIC_REGISTRATION=false`; clients must honor `public-config` |
| **SSO is full-page redirect** | Not an Axios POST; callback uses `FRONTEND_BASE_URL` |
| **Do not modify Gmail / ClickUp when extending connectors** | Existing agent rule; new panels follow `/connectors/{type}` |
| **Snake_case JSON on the wire** | Clients map to camelCase in their own layers |
| **No root README edits for this initiative** | Keep root README for ops/setup only |

---

## Out of scope (for this documentation initiative)

- Implementing routes, UI screens, or migrations
- Changing production deploy topology
- SAML / SCIM (planned backend — see [../planned/sso.md](../planned/sso.md))
- Rebuilding embeddable UMD widgets inside frontend (Server workspace) (legacy SPA / static builds remain reference)

---

## Ownership split

| Layer | Owner repo | Typical work |
|-------|------------|--------------|
| API behavior, CORS, `FRONTEND_BASE_URL`, contract docs | `RAGSuite_Server/backend` | Env + contract clarity; rare auth tweaks only if proven gap |
| Screens, `apiUrl.ts`, actions, navigation, OAuth UX | `frontend (Server workspace)` | Feature modules + network layer |
| Reference of “worked before” | `/Users/arun/Desktop/RAGSUITE/frontend` | Read-only patterns |

---

## Related reading order for agents

1. This file → [COMPARISON.md](./COMPARISON.md) → [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md) → [COMPATIBILITY_PLAN.md](./COMPATIBILITY_PLAN.md)
2. [MOBILE_RAGSUITE.md](./MOBILE_RAGSUITE.md)
3. Backend: [../backend/external-client-contract.md](../backend/external-client-contract.md)
4. Skills: backend skill + [ragsuite-frontend](../../.cursor/skills/ragsuite-frontend/SKILL.md)


---

## Ports (local target stack)

| Service | Port |
|---------|------|
| Backend API | `8002` |
| frontend (Server workspace) Expo web | `8081` |
| `FRONTEND_BASE_URL` | `http://localhost:9091` |

Keep backend and mobile in **separate** Cursor workspaces / git repositories.
