# Compatibility Gaps — Backend ↔ frontend (Server workspace)

**Last updated:** 2026-07-15  
**Status legend:** `CLIENT` = fix in frontend (Server workspace) · `BACKEND` = rare API/contract change · `OPS` = env / CORS / redirect config · `DEFER` = explicit non-goal for now · `DONE` = closed since prior matrix

Gaps are relative to **shipped backend capability**. Legacy SPA is cited only where it shows a working client pattern.

**Workspace reminder:** Close gaps in the **frontend (Server workspace)** workspace; keep this backend repo for API/docs only. Do not merge repos.

---

## Closed / largely closed (2026-07)

| Was | Now |
|-----|-----|
| G2 Google SSO UI | **DONE (web), DEFER (native)** — web SSO start + `/login/callback` hydrates Bearer (redirect hash); native app still password-first. **OPS:** `FRONTEND_BASE_URL=http://localhost:9091`, CORS includes `:9091`. |
| G3 Org admin UI | **DONE (mobile)** — Team members, project assignments, hierarchical permissions, hide denied modules. |
| Document preview Unmatched Route | **DONE** — stream/blob URLs use API `:9090` via `buildApiUrl`, not Expo origin. |
| Gmail inspector content 500 / “None” embeddings | **DONE (backend + client)** — no `MutableHeaders.pop`; MIME `text/plain`; coverage `skip_cache` / short TTL. |
| Selected-doc reindex stuck / 429 as failure | **DONE (backend)** — rate-limit defer, status sync, orphaned reindex unlock, staging recovery. |

---

## P0 — Remaining for production polish

### G1. Public auth config not (fully) consumed

| | |
|--|--|
| **Backend** | `GET /api/v1/crawl/auth/public-config` → `registration_enabled`, `sso_enabled`, `organization_slug` |
| **Legacy SPA** | Calls it; gates signup |
| **frontend (Server workspace)** | **DONE** — consumed by `usePublicAuthConfig`; sign-in/register UX is invite-aware |
| **Owner** | `DONE` |
| **Why** | Login-only orgs stay invite-only and do not expose public sign-up flow |

### G4. Local API / CORS / redirect alignment

| | |
|--|--|
| **Backend** | `:9090`; `CORS_ORIGINS`; **`FRONTEND_BASE_URL=http://localhost:9091`** for Expo web |
| **frontend (Server workspace)** | `envs/` → `API_URL` origin `http://localhost:9090`; web **`:9091`** |
| **Owner** | `OPS` + `CLIENT` |
| **Why** | SSO OAuth fails if redirect host ≠ `FRONTEND_BASE_URL`; cookies alone fail cross-origin — Bearer hash hydrate is required |

**Checklist:**

1. Backend `.env`: `FRONTEND_BASE_URL=http://localhost:9091`
2. CORS includes `http://localhost:9091`
3. Mobile `API_URL` is API **origin** (verify `apiUrl.ts` joining)
4. Never put document `/content-stream` on `:9091`

---

## P1 — Feature parity with shipped connectors

### G5. Confluence / SharePoint / Slack panels absent

| | |
|--|--|
| **Backend** | `/api/v1/connectors/confluence|sharepoint|slack/*` |
| **frontend (Server workspace)** | **DONE** — connector panels exist in crawl management UI |
| **Owner** | `DONE` |
| **Why** | Backend and frontend now both expose these connector flows |

Member without `connectors:manage` should get graceful empty status (backend soft-fail on status GETs) — do not crash the crawl page.

### G6. ClickUp UI absent (legacy API)

| | |
|--|--|
| **Backend** | `/api/v1/clickup/*` |
| **Both frontends** | No UI |
| **Owner** | `DEFER` |

---

## P2 — Hardening / polish

### G7. Invite-aware registration UX

When `registration_enabled` is false, register supports **invite activation** only. Backend enforces; keep client copy honest. **Owner:** `CLIENT` (ties to G1)

### G8. Forgot-password

**DONE** — API + UI wired (`/crawl/auth/forgot-password/*` flows). Keep copy aligned with invite-only org model.

### G9. SSE streaming credentials

Verify Bearer on all stream paths in app-chat-widget / compare. **Owner:** `CLIENT` (verify)

### G10. Embeddable UMD widgets

Admin in-app widget ≠ published-site UMD embeds. **Owner:** `DEFER` for admin-compat

### G11. Onboarding depth

Mobile 2-step vs richer backend onboarding. **Owner:** `DEFER` / product

---

## Not gaps (already compatible)

| Area | Notes |
|------|-------|
| Password login + 2FA + logout + verify | `/crawl/auth/*` + Bearer |
| Dual auth transport | Backend accepts cookie **or** Bearer |
| Org Team + hierarchical permissions | Mobile wired; backend `/org/*` |
| Google SSO (web) | Callback + Bearer hydrate; password remains fallback |
| Public registration UX | Register route is invite-only; direct public registration is disabled |
| Documents / crawl domain / Gmail / Drive / Notion | Full admin paths |
| Document preview PDF/DOCX/text | API-origin content + content-stream |
| Embedding coverage labels | Use fresh/skip_cache after ingest |
| Chatbot / search / analytics / most config | Present |

---

## Agent notes

- Prefer **client** fixes for UI gaps; avoid backend redesign.
- Update this file when a gap closes.
- Cross-repo work: one workspace at a time ([workspace-isolation](../../.cursor/rules/workspace-isolation.mdc)).
