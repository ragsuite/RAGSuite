# Frontend Comparison — Legacy SPA vs frontend (Server workspace) (Expo web `:9091`) vs Backend

**Last updated:** 2026-07-15
**Evidence paths (read-only):**

- Legacy: `/Users/arun/Desktop/RAGSUITE/frontend/client/src/`
- Target: `/Users/arun/RAGSuite_Server/frontend/src/`
- Backend: `RAGSuite_Server/backend` (`app/auth.py`, `docs/backend/*`)

---

## 1. Technology

| Topic | Legacy Vite SPA | frontend (Server workspace) | Backend expectation |
|-------|-----------------|-----------------|---------------------|
| Stack | React 18, Vite 5, Wouter | Expo 55, RN 0.83, Expo Router, React 19 | FastAPI `/api/v1` |
| UI | Radix + Tailwind | Brand tokens + shared RN components | N/A |
| Data | TanStack Query + Axios | Feature hooks + Axios actions | Dual response shapes |
| Platforms | Browser SPA | **Web + iOS + Android** | CORS + OAuth redirects |
| Dev UI port (typical) | **5173** (monorepo) | Expo web (env-driven) | `FRONTEND_BASE_URL` default **5175** |
| API target | Proxy → `:8000` (monorepo) or `:9090` | `env.json` → `API_URL` | **`:9090`** this repo |

---

## 2. Authentication (critical difference)

| Topic | Legacy SPA | frontend (Server workspace) | Backend (`app/auth.py`) |
|-------|------------|-----------------|-------------------------|
| Transport | **HttpOnly cookie** `access_token` | **`Authorization: Bearer`** | Accepts **Bearer or cookie** |
| Axios | `withCredentials: true` | No credentials flag | CORS `allow_credentials=True` |
| Login body token | Returned but **not** used as Bearer | **Stored** and sent as Bearer | Both valid |
| Session store | `user_data` in localStorage | SecureStore / `localStorage` session JSON | `UserSession` by JWT `jti` |
| Verify | `GET /crawl/auth/verify` | Same | Same |
| 2FA | Supported | Supported | Supported |
| `public-config` | Used (registration gate) | **Not called** | Returns registration + SSO flags |
| Google SSO | **None** | **None** | **Shipped** `/auth/sso/*` |
| Forgot password | Stub UI | Stub UI | No dedicated reset API (both clients UI-only) |

**Implication:** Mobile Bearer auth is **already valid** against this backend. Do not “fix” the backend to cookie-only. Gaps are missing client features (`public-config`, SSO redirect UX, org screens), not an auth protocol conflict.

---

## 3. Module coverage matrix

| Product area | Backend | Legacy SPA | frontend (Server workspace) |
|--------------|---------|------------|-----------------|
| Sign-in / register / verify email / 2FA | ✅ | ✅ | ✅ |
| Honor login-only via `public-config` | ✅ | Partial (`registration_enabled` only historically) | ❌ |
| Onboarding | ✅ | Multi-step SPA | ✅ 2-step (branding → project) |
| Projects + activate + reindex | ✅ | ✅ | ✅ |
| Overview / analytics | ✅ | ✅ | ✅ |
| Crawl domains + jobs | ✅ | ✅ | ✅ |
| Documents upload / index | ✅ | ✅ | ✅ |
| Gmail | ✅ `/gmail/*` | ✅ | ✅ |
| Google Drive | ✅ | ✅ | ✅ |
| Notion | ✅ | ✅ | ✅ |
| Confluence | ✅ | ❌ | ❌ |
| SharePoint | ✅ | ❌ | ❌ |
| Slack | ✅ | ❌ | ❌ |
| ClickUp | ✅ `/clickup/*` | ❌ | ❌ |
| Chatbot configuration | ✅ | ✅ | ✅ |
| Search configuration | ✅ | ✅ | ✅ |
| Compare models | ✅ | ✅ | ✅ |
| Chat / search history | ✅ | ✅ | ✅ |
| In-app / floating chat | ✅ | Embeddable + in-app | App chat widget (stream) |
| Configuration / API keys / n8n | ✅ | ✅ | ✅ |
| Feedback moderation | ✅ | ✅ | ✅ |
| Audit logs | ✅ | ✅ | ✅ |
| System health | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ |
| Profile / 2FA settings | ✅ | ✅ | ✅ |
| Workspace branding (`/settings`) | ✅ | ✅ | ✅ |
| Org Team admin (`/org/users`) | ✅ | ❌ | ❌ |
| Org SSO settings (`/org/sso`) | ✅ | ❌ | ❌ |
| SSO login callback route | ✅ redirect target | ❌ | ❌ |
| Mock Integrations page | N/A | Mock only | Excluded (parity docs) |
| UMD embed widgets build | Serves static paths | Builds `dist/widget` | Not a goal of mobile repo |

---

## 4. Network / API layer patterns

| Pattern | Legacy SPA | frontend (Server workspace) |
|---------|------------|-----------------|
| Path catalog | Spread across `services/api/*.ts` | Central `src/network/apiUrl.ts` |
| Call sites | Domain service files | `src/network/actions/*.actions.ts` |
| DTO mapping | Ad hoc snake ↔ camel | Feature `*-mapper.ts` |
| Streaming | `fetch` + `credentials: 'include'` | Bearer `fetch` / stream utils |
| OAuth connectors | Redirect helpers in `client.ts` | Drive/Notion auth start + web/native handling |

---

## 5. Navigation models

| Legacy route | frontend (Server workspace) route |
|--------------|------------------------|
| `/login` | `/(auth)/sign-in` |
| `/signup` | `/(auth)/register` |
| `/` Overview | `/(app)/(tabs)/index` |
| `/crawl` | `crawl-management` |
| `/chatbot-configuration` | `chatbot-config/*` |
| `/search-configuration` | `search-config/*` |
| `/configuration` | `configuration` |
| `/team`, `/settings/sso` | **Not present** |
| `/login/callback` (SSO) | **Not present** |

---

## 6. What “compatible” meant historically (legacy SPA)

The legacy SPA proved:

- Cookie session + crawl/auth paths
- Core RAG operator loops (crawl → index → chatbot/search config → chat)
- Drive + Notion + Gmail connector UX against `/connectors/*` and `/gmail/*`
- Widget embed headers for published widgets

It did **not** prove org admin or Google SSO UI against this backend (those APIs landed after / outside that SPA).

---

## 7. What “almost compatible” means (frontend (Server workspace))

frontend (Server workspace) already covers most operator modules via Bearer auth. Remaining gaps are catalogued in [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md):

1. Auth productization (`public-config`, SSO, invite-aware register)
2. Org admin surfaces
3. Confluence / SharePoint / Slack (and optionally ClickUp) panels
4. Env / CORS / `FRONTEND_BASE_URL` alignment for OAuth and SSO

---

## Related

- [GOAL_AND_INTENT.md](./GOAL_AND_INTENT.md)
- [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md)
- mobile docs: `/Users/arun/RAGSuite_Server/frontend/docs/WEB_MOBILE_PARITY.md` (legacy-web ↔ mobile parity — **not** the same as this backend-compat matrix)
