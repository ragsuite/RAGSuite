# Backend Compatibility — frontend ↔ backend (same Server workspace)

> **Purpose:** Track what this client already consumes vs what the standalone backend ships.  
> **Mirror of:** `/Users/arun/RAGSuite_Server/backend/docs/frontend/COMPATIBILITY_GAPS.md` (backend-owned matrix). Keep meaning aligned when either side changes.  
> **Do not confuse with:** [WEB_MOBILE_PARITY.md](./WEB_MOBILE_PARITY.md) (legacy Vite SPA **UI** parity).  
> **Last synced:** 2026-07-08

---

## Clients

| Client | Path | Session | Role |
| ------ | ---- | ------- | ---- |
| **This repo (target)** | `/Users/arun/RAGSuite_Server/frontend` | **Bearer JWT** | Primary admin UI going forward |
| Legacy SPA | `/Users/arun/Desktop/RAGSUITE/frontend` | Cookie + `withCredentials` | Historical reference; core ops still relevant for patterns |

Backend accepts **both** session transports. Prefer client fixes over API redesign.

---

## Already compatible (not gaps)

| Area | Notes |
| ---- | ----- |
| Password login + 2FA + logout + verify | `/api/v1/crawl/auth/*` |
| Bearer session | `Authorization` from login `access_token` |
| Projects, crawl sites, documents | Actions + UI |
| Gmail **API actions** | `apiUrl.ts` → `/api/v1/gmail/*` + crawl tab |
| Google Drive, Notion | `/api/v1/connectors/{type}/*` + crawl tabs (+ `/api/v1` on redirect helpers) |
| Chatbot / search / analytics / audit / feedback / health / notifications / profile | Present |
| API keys + n8n | Configuration module |
| Snake_case wire format | Mapped in feature layers |

### Client drift to fix in code (not a backend gap)

| Topic | Backend truth | Current client risk |
| ----- | ------------- | ------------------- |
| Gmail OAuth **redirect URI string** shown in UI | `{API}/api/v1/gmail/auth/callback` | `gmail-oauth.ts` may build `/api/v1/connectors/gmail/auth/callback` — register that in Google Console against this backend will fail. Prefer backend path when fixing code. |

---

## Open gaps (same IDs as backend `COMPATIBILITY_GAPS.md`)

### P0

| ID | Topic | Owner | Mobile reality |
| -- | ----- | ----- | -------------- |
| **G1** | `GET /crawl/auth/public-config` | CLIENT | **Shipped** — `AUTH_PUBLIC_CONFIG` + `usePublicAuthConfig`; register gated |
| **G2** | Google SSO (`/auth/sso/*` + `/login/callback`) | CLIENT + OPS | **Shipped (web)** — SSO CTA, full-page start, `/(auth)/login/callback` cookie hydrate; native deferred |
| **G3** | Org admin UI (`/org/*`) | CLIENT | **Shipped** — Organization drawer (admin-only): Overview, Members, SSO |
| **G4** | Env / CORS / redirect alignment | OPS + CLIENT | Set `FRONTEND_BASE_URL` to Expo web origin owning `/login/callback`; `CORS_ORIGINS` must allow credentials; Google redirect = `{API}/api/v1/auth/sso/callback`. Web logout must clear httpOnly cookie via backend `POST /crawl/auth/logout`. |

### P1–P2

| ID | Topic | Owner | Mobile reality |
| -- | ----- | ----- | -------------- |
| **G5** | Confluence / SharePoint / Slack panels | DONE | Panels are available in crawl management |
| **G7** | Invite-aware register UX | CLIENT | **Shipped** — invite activation copy when `registration_enabled` is false |
| **G9** | SSE streams send Bearer | CLIENT (verify) | Should already; verify all stream helpers |

### Deferred

| ID | Topic | Status |
| -- | ----- | ------ |
| **G6** | ClickUp UI (`/clickup/*`) | DEFER unless product prioritizes |
| **G8** | Forgot-password | DONE — API + UI wired |
| **G10** | UMD embed widgets | Separate pipeline (legacy builds / backend static routes) |
| **G11** | Deeper onboarding | Mobile intentionally **2-step**; product decision |

---

## Crawl UI vs backend connectors

| Backend | Mobile crawl tab |
| ------- | ---------------- |
| Domain crawl + documents | ✅ |
| Gmail (legacy) | ✅ |
| Google Drive | ✅ |
| Notion | ✅ |
| Confluence / SharePoint / Slack | ✅ |
| ClickUp | ❌ deferred |

---

## Agent rules

1. Prefer consuming existing `/api/v1` routes over inventing new backend endpoints.
2. When closing a gap, update this file **and** expect backend `docs/frontend/COMPATIBILITY_GAPS.md` to be updated by whoever owns that repo.
3. Full endpoint map: [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md).
4. OAuth redirect URIs always include `/api/v1` and use Gmail vs `/connectors/{type}` correctly.
5. Do not edit backend files from mobile-only tasks; backend path is read-only for this workflow.

---

## Related

- [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md)
- Backend: `docs/frontend/COMPATIBILITY_PLAN.md`, `docs/frontend/GOAL_AND_INTENT.md`, `docs/frontend/MOBILE_RAGSUITE.md`
