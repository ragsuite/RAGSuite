# Frontend — Compatibility & Context

**Audience:** Backend agents, frontend integrators, product owners  
**Last updated:** 2026-07-15  
**Scope:** Documentation only in this repo. Frontend apps live **outside** `RAGSuite_Server/backend` (separate git + Cursor workspaces).

---

## Intent

This backend shipped against the **legacy Vite React SPA**. Product UI is **frontend (Server workspace)** (Expo / React Native + web on **`:9191`**). Core admin features, org Team/permissions, and Google SSO are largely wired; a few modules remain incomplete (see gaps).

**Goal of this folder:** keep a precise, non-breaking map so **`RAGSuite_Server/backend` stays compatible with `/Users/arun/RAGSuite_Server/frontend`**, without rewriting backend architecture or dropping legacy SPA contract support.

**Do not** merge this backend repo and `frontend (Server workspace)` into one workspace/git tree. Implement UI code only under `/Users/arun/RAGSuite_Server/frontend`. If a task requires backend + frontend changes, agents edit both absolute paths in one task without merging repos.

---

## Frontends (reference paths)

| Client | Path | Role | Dev port |
|--------|------|------|----------|
| **Legacy SPA** | `/Users/arun/Desktop/RAGSUITE/frontend` | Vite + React cookie-session admin | `:5173` |
| **Target (primary)** | `/Users/arun/RAGSuite_Server/frontend` | Expo 55 admin (iOS, Android, **web**) | **`:9191`** |
| **This repo** | `RAGSuite_Server/backend` | API **`:9090`** only — no UI bundled | — |

Backend `FRONTEND_BASE_URL` for local SSO/OAuth against the target UI: **`http://localhost:9191`**.

---

## Document map

| Document | Purpose |
|----------|---------|
| **[GOAL_AND_INTENT.md](./GOAL_AND_INTENT.md)** | Why the migration exists; non-negotiable constraints |
| **[COMPARISON.md](./COMPARISON.md)** | Side-by-side: legacy SPA ↔ frontend (Server workspace) ↔ backend |
| **[COMPATIBILITY_GAPS.md](./COMPATIBILITY_GAPS.md)** | Precise remaining gaps |
| **[COMPATIBILITY_PLAN.md](./COMPATIBILITY_PLAN.md)** | Ordered workstreams |
| **[MOBILE_RAGSUITE.md](./MOBILE_RAGSUITE.md)** | Agent orientation for the target frontend |

**API contracts:** [../backend/external-client-contract.md](../backend/external-client-contract.md) · [../backend/organization-and-sso.md](../backend/organization-and-sso.md) · [../connectors/README.md](../connectors/README.md)

**Agent skills / rules:** [../../.cursor/skills/ragsuite-frontend/SKILL.md](../../.cursor/skills/ragsuite-frontend/SKILL.md) · [../../.cursor/rules/workspace-isolation.mdc](../../.cursor/rules/workspace-isolation.mdc)

---

## Status at a glance (2026-07-15)

| Area | Backend | Legacy SPA | frontend (Server workspace) |
|------|---------|------------|-----------------|
| Password auth `/crawl/auth/*` | ✅ | ✅ Cookie | ✅ Bearer JWT |
| Dual session (cookie **or** Bearer) | ✅ | Cookie only | Bearer only |
| `GET /crawl/auth/public-config` | ✅ | ✅ | ⚠️ Prefer wire for login-only / SSO gate |
| Google SSO `/auth/sso/*` | ✅ | ❌ | ✅ Callback + Bearer hydrate (hash) |
| Org admin `/org/*` | ✅ | ❌ | ✅ Team users / permissions / assignments |
| Hierarchical project permissions | ✅ | ❌ | ✅ Independent module toggles; hide denied nav |
| Crawl / docs / Gmail / Drive / Notion | ✅ | ✅ | ✅ |
| Document preview (PDF/DOCX/text) | ✅ content / content-stream | ✅ | ✅ API-origin URLs (`buildApiUrl`) |
| Confluence / SharePoint / Slack UI | ✅ API | ❌ | ❌ |
| ClickUp UI | ✅ API | ❌ | ❌ |
| Chatbot / search / analytics / audit / … | ✅ | ✅ | ✅ (majority) |
| Embeddable UMD widgets | Serves assets | Builds widgets | In-app widget only |

Legend: ✅ present · ⚠️ partial · ❌ absent
