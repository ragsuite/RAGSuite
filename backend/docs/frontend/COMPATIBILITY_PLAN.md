# Compatibility Plan — Make Backend Work Fully with frontend (Server workspace)

**Last updated:** 2026-07-08  
**Prerequisite reading:** [GOAL_AND_INTENT.md](./GOAL_AND_INTENT.md) · [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md)  
**Constraint:** Prefer **client and ops changes**. Change backend only if a proven incompatibility remains after client fixes. Do not break cookie-session legacy clients.

---

## Guiding principles

1. **Preserve dual auth** — cookie (legacy / redirects) and Bearer (frontend (Server workspace)).
2. **Consume shipped APIs** — do not reinvent org/SSO/connectors on the server.
3. **Mirror proven UI** — Drive/Notion panels in either frontend are the template for Confluence/SharePoint/Slack.
4. **Contract first** — update [../backend/external-client-contract.md](../backend/external-client-contract.md) when client expectations change; keep snake_case on the wire.
5. **Verify on web first** — Expo web against `:9090`, then native OAuth/SSO.

---

## Workstream A — Auth productization (P0)

| Step | Where | Action |
|------|-------|--------|
| A1 | frontend (Server workspace) | Add `PUBLIC_CONFIG` to `apiUrl.ts`; fetch on sign-in / register boot |
| A2 | frontend (Server workspace) | Hide register / show invite-only copy when `registration_enabled === false` |
| A3 | frontend (Server workspace) | If `sso_enabled`, show Google sign-in CTA using `organization_slug` |
| A4 | frontend (Server workspace) | Implement SSO start as **full page / system browser** to `/auth/sso/start` |
| A5 | frontend (Server workspace) | Implement `/login/callback` (web) → verify session → hydrate Bearer storage |
| A6 | RAGSuite_Server/backend ops | Set `FRONTEND_BASE_URL` to the actual Expo web origin (or production URL) |
| A7 | RAGSuite_Server/backend ops | Ensure `CORS_ORIGINS` includes that origin; Google Console callback = backend `/auth/sso/callback` |
| A8 | Both | Document native SSO deep-link approach separately; ship web SSO first if native is blocked |

**Done when:** Login-only org cannot open public signup; Google SSO completes on Expo web against this API; Bearer session usable after callback.

---

## Workstream B — Organization admin (P0)

| Step | Where | Action |
|------|-------|--------|
| B1 | frontend (Server workspace) | Add `org.actions.ts` + `apiUrl` entries for `/org/*` |
| B2 | frontend (Server workspace) | Team / users screen (list, invite, patch role, deactivate) |
| B3 | frontend (Server workspace) | User ↔ project assignment UI |
| B4 | frontend (Server workspace) | Org SSO settings (GET/PUT `/org/sso`, test endpoint) for org admins |
| B5 | frontend (Server workspace) | Gate nav by org-admin capability from session / `/org` |
| B6 | Docs here | Keep types aligned with [../backend/organization-and-sso.md](../backend/organization-and-sso.md) |

**Done when:** Org admin can manage users and SSO without using curl/OpenAPI.

---

## Workstream C — Connector parity (P1)

| Step | Where | Action |
|------|-------|--------|
| C1 | frontend (Server workspace) | Extend `CrawlPrimaryTab` + panels for `confluence`, `sharepoint`, `slack` |
| C2 | frontend (Server workspace) | Action files mirroring `google-drive.actions.ts` / `notion.actions.ts` |
| C3 | frontend (Server workspace) | Browse UX: spaces / sites+drives / channels per [../connectors/](../connectors/) |
| C4 | Ops | OAuth app configs + redirect URLs for each connector |
| C5 | Optional | ClickUp only if product prioritizes (legacy; `DEFER` by default) |

**Done when:** Operator can connect and sync all five framework connectors from crawl UI.

---

## Workstream D — Environment & local developer path (P0)

| Step | Where | Action |
|------|-------|--------|
| D1 | frontend (Server workspace) | Add documented `envs/local.backend8002.json` (or README note) → `http://localhost:9090` (or `/api/v1` via proxy if used) |
| D2 | RAGSuite_Server/backend | Document pairing in [MOBILE_RAGSUITE.md](./MOBILE_RAGSUITE.md) (already) — keep in sync |
| D3 | Both | Smoke checklist: login → project → crawl → Drive OAuth → chat message |

**Suggested local pairing**

```bash
# Backend repo
./start.sh   # API :9090

# frontend (Server workspace)
# env.json API_URL = "http://localhost:9090"  (or LAN IP for device)
yarn env:local && yarn web
```

For physical devices, use LAN IP or ngrok; put the **same public origin** in backend `CORS_ORIGINS` and connector/SSO redirect config as needed.

---

## Workstream E — Contract & agent docs (ongoing, this repo)

| Step | Action |
|------|--------|
| E1 | Keep `docs/frontend/*` accurate when gaps close |
| E2 | Update `external-client-contract.md` “Clients” section for Bearer-primary mobile |
| E3 | Skills: backend + frontend stay cross-linked |
| E4 | Do **not** delete legacy SPA references until product retires it |

---

## Explicit non-goals (near term)

| Item | Reason |
|------|--------|
| Forcing cookie auth on native | Breaks Expo SecureStore model |
| Removing cookie support | Breaks legacy SPA + some OAuth redirects |
| Backend rewrite for camelCase | Wire format is snake_case |
| SAML / SCIM | Planned separately |
| Porting UMD widget builds into Expo | Separate distribution |

---

## Verification checklist (human / QA)

```text
[ ] POST /crawl/auth/login from mobile → Bearer works on GET /projects
[ ] public-config hides signup when registration_enabled=false
[ ] Google SSO web: start → Google → callback → authenticated shell
[ ] Org admin: invite user, assign project, GET/PUT /org/sso
[ ] Crawl: Drive + Notion unchanged after new tabs
[ ] Crawl: Confluence + SharePoint + Slack sync enqueue visible in jobs
[ ] Legacy SPA still logs in with cookies against same API (regression)
[ ] pytest + smoke_connectors + smoke_org_sso still pass on backend
```

---

## Suggested sequencing

```text
D (env) → A (public-config + SSO) → B (org admin) → C (connectors) → E (docs sweep)
```

Env first so every other workstream is testable against `:9090`.

---

## Related

- Gaps: [COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md)
- Mobile orientation: [MOBILE_RAGSUITE.md](./MOBILE_RAGSUITE.md)
- Backend smoke: `scripts/smoke_org_sso.py`, `scripts/smoke_connectors.py`
