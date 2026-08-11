# Future Implementations — Master Roadmap

**Last updated:** 2026-07-08  
**Scope:** Documentation only — no code changes in this document.  
**Repo:** Standalone backend (`RAGSuite_Server/backend`).  
**Target UI:** `/Users/arun/RAGSuite_Server/frontend`. **Legacy SPA:** `/Users/arun/Desktop/RAGSUITE/frontend`.  
**Compat docs:** [../frontend/README.md](../frontend/README.md).

This is the consolidated index for **planned** product capabilities. Existing behavior is preserved in other docs; this file tracks what comes next and where to find design detail.

---

## Priority overview

| # | Initiative | Status | Doc |
|---|------------|--------|-----|
| 1 | **Organization architecture** (admin → users, Google SSO) | ✅ Backend shipped · **frontend (Server workspace) UI pending** | [organization-and-sso.md](../backend/organization-and-sso.md) · [../frontend/COMPATIBILITY_GAPS.md](../frontend/COMPATIBILITY_GAPS.md) |
| 2 | **MCP / content connectors** (five platforms) | ✅ Backend shipped · mobile has Drive/Notion; **Confluence/SharePoint/Slack UI pending** | [connectors/README.md](../connectors/README.md) · [../frontend/](../frontend/) |
| 3 | **SSO** (SAML, SCIM) | Google OIDC shipped; SAML planned | [sso.md](./sso.md) |

---

## 1. Organization architecture

**Vision:** Professional B2B access model — organization admins provision users, assign selective project permissions, and public registration is disabled.

**Already in codebase:**

- `organization_members`, `project_members`, `organization_sso_configs`, `user_idp_identities`
- Routes: `/api/v1/org/*`, `/api/v1/auth/sso/*`
- Bootstrap CLI: `python -m app.cli bootstrap-org-admin`
- ACL: `require_org_admin`, `require_project_permission` (partial route rollout)

**Frontend (frontend (Server workspace)):** See [../frontend/COMPATIBILITY_PLAN.md](../frontend/COMPATIBILITY_PLAN.md) · [external-client-contract.md](../backend/external-client-contract.md)

**Full design:** [organization-architecture.md](./organization-architecture.md) · **Backend API spec:** [../backend/future/organization.md](../backend/future/organization.md)

---

## 2. MCP / content connectors

**Vision:** Users connect external knowledge sources from the Integrations UI; content syncs via `CONNECTOR_SYNC` → `DOCUMENT_INGEST` into RAG chat and search.

### Implementation status

| Connector | Status | API prefix | Plan doc |
|-----------|--------|------------|----------|
| **Gmail** | ✅ Implemented (legacy) | `/api/v1/gmail` | Out of scope for connector framework refactor |
| **ClickUp** | ✅ Implemented (legacy) | `/api/v1/clickup` | Out of scope |
| **Google Drive** | ✅ Implemented | `/api/v1/connectors/google_drive` | [google-drive.md](../connectors/google-drive.md) |
| **Notion** | ✅ Implemented | `/api/v1/connectors/notion` | [notion.md](../connectors/notion.md) |
| **Confluence** | ✅ Implemented | `/api/v1/connectors/confluence` | [confluence.md](../connectors/confluence.md) |
| **SharePoint** | ✅ Implemented | `/api/v1/connectors/sharepoint` | [sharepoint.md](../connectors/sharepoint.md) |
| **Slack** | ✅ Implemented | `/api/v1/connectors/slack` | [slack.md](../connectors/slack.md) |

### Shared framework (implemented)

- Tables: `connector_integrations`, `connector_sources`, `connector_settings`, `connector_sync_jobs`, `connector_documents`
- `app/services/connectors/framework.py` — credentials, settings validation, sync enqueue, purge
- Job types: `CONNECTOR_SYNC`, `DOCUMENT_INGEST`
- Routers: `connectors.py`, `connectors_notion.py`, `connectors_confluence.py`, `connectors_sharepoint.py`, `connectors_slack.py`
- Smoke: `scripts/smoke_connectors.py`

### Remaining work (frontend / product)

- External SPA panels + hooks mirroring Drive/Notion for Confluence / SharePoint / Slack
- Optional Slack staging inbox UX (backend currently auto-ingests like Drive/Notion)
- Org-level connector policy when ACL expands

**Backend archive / checklist:** [../backend/future/connectors.md](../backend/future/connectors.md)

### Future: org-level connector policy

When [organization architecture](./organization-architecture.md) ACL expands:

- Org admin enables which connector types members may use
- Optional org-wide OAuth app credentials (vs per-user)
- Connector sync quotas per org (extends existing `max_*` on organizations)

---

## 3. SSO (Single Sign-On)

**Vision:** Enterprise customers authenticate via OIDC or SAML; aligns with login-only UX and admin-provisioned users.

**Phases:**

1. OIDC (Google Workspace, Entra ID, Okta) — Google shipped
2. Per-org SSO config + admin UI — backend shipped; frontend pending
3. JIT provisioning (optional per org)
4. SAML 2.0
5. SCIM (enterprise)

**Depends on:** Organization model for org-scoped IdP config and membership.

**Full design:** [sso.md](./sso.md) · **Backend API spec:** [../backend/future/sso.md](../backend/future/sso.md)

---

## Suggested delivery order

```text
Phase A (access foundation) — backend done
  └── External SPA: Team + SSO settings + login SSO

Phase B (connectors) — backend done
  └── External SPA: Confluence / SharePoint / Slack panels

Phase C (enterprise auth)
  ├── SAML 2.0
  └── SCIM

Phase D (enterprise polish)
  ├── Group → role mapping
  └── Org-level connector policies
```

---

## Documentation index

| Document | Purpose |
|----------|---------|
| [architecture.md](../architecture.md) | System architecture |
| [organization-architecture.md](./organization-architecture.md) | Admin → users, permissions, no registration |
| [sso.md](./sso.md) | OIDC, SAML, JIT, SCIM roadmap |
| [connectors/README.md](../connectors/README.md) | Connector integration overview |

---

## Out of scope (this roadmap)

- Changing Gmail or ClickUp integration architecture
- Vector DB migration away from ChromaDB
- Public self-service signup as a product feature
- Implementing code in this documentation pass
