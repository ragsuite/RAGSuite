# RAGSuite Backend — Developer Reference

**Audience:** Backend developers, frontend integrators, and AI agents.  
**Last updated:** 2026-07-08  
**Stack:** Python 3.14 · FastAPI · SQLAlchemy · PostgreSQL · ChromaDB · Redis · APScheduler  
**Layout:** `app/` at repo root (standalone backend — not `backend/app/`)

**External SPA / widgets:** Start with [external-client-contract.md](./external-client-contract.md) and [organization-and-sso.md](./organization-and-sso.md).  
**Frontend migration (legacy → frontend (Server workspace)):** [../frontend/README.md](../frontend/README.md).

---

## Document map

| Document | Contents |
|----------|----------|
| **[organization-and-sso.md](./organization-and-sso.md)** | **Org + Google SSO architecture & frontend contract** |
| [external-client-contract.md](./external-client-contract.md) | SPA/widget/mobile integration (login, SSO, pages → APIs) |
| [../frontend/README.md](../frontend/README.md) | Legacy Vite vs **frontend (Server workspace)** compatibility |
| [api-reference.md](./api-reference.md) | **Every implemented route** — method, path, auth, purpose |
| [architecture.md](./architecture.md) | Process model, request lifecycle, module layout |
| [configuration.md](./configuration.md) | **Every env var** — defaults, SSO, registration |
| [data-models.md](./data-models.md) | **PostgreSQL tables** — org, SSO, ACL tables |
| [auth-and-security.md](./auth-and-security.md) | JWT, sessions, org ACL, SSO flow |
| [services-and-jobs.md](./services-and-jobs.md) | Service layer map, background jobs |
| [future/](./future/README.md) | **Remaining planned** — SAML/SCIM (connectors archived as shipped) |

---

## Quick facts (do not get wrong)

| Topic | Truth |
|-------|--------|
| API base | `/api/v1` on port **9090** (dev) |
| OpenAPI | `http://localhost:9090/docs` |
| Auth routes | **`/api/v1/crawl/auth/*`** (not `/api/v1/auth/login`) |
| SSO routes | **`/api/v1/auth/sso/*`** (Google OIDC) |
| Org routes | **`/api/v1/org/*`** |
| Admin client auth | Session **cookie or Bearer** (legacy cookie; mobile Bearer) |
| Target UI | `/Users/arun/RAGSuite_Server/frontend` — see [../frontend/](../frontend/) |
| Login-only | `ALLOW_PUBLIC_REGISTRATION=false` |
| SSO global gate | `SSO_ENABLED=true` + org admin `PUT /org/sso` |
| Bootstrap admin | `python -m app.cli bootstrap-org-admin` |
| Required env | `DATABASE_URL`, `JWT_SECRET_KEY`, `CUSTOM_LLM_INTERNAL_API_KEY` |
| Migrations | `alembic upgrade head` (repo root) |

---

## Implemented vs planned

| Area | Status | Doc |
|------|--------|-----|
| Core API (crawl, RAG, projects, …) | ✅ | [api-reference.md](./api-reference.md) |
| **Organization admin + ACL** | ✅ | [organization-and-sso.md](./organization-and-sso.md) |
| **Google OIDC SSO** | ✅ | [organization-and-sso.md](./organization-and-sso.md) |
| Google Drive, Notion, Confluence, SharePoint, Slack | ✅ | [api-reference.md](./api-reference.md#connectors) · [../connectors/README.md](../connectors/README.md) |
| Gmail, ClickUp | ✅ Legacy | [api-reference.md](./api-reference.md) |
| SAML SSO, SCIM | 📋 Planned | [planned/sso.md](../planned/sso.md) |
| Org admin + connector frontend UI | 📋 frontend (Server workspace) (gaps tracked) | [../frontend/COMPATIBILITY_PLAN.md](../frontend/COMPATIBILITY_PLAN.md) |

---

## Code layout

```
app/
├── main.py
├── auth.py                  # JWT, org ACL, project permissions
├── models.py
├── schemas.py
├── routes/
│   ├── crawl.py             # /crawl/auth/* + crawl
│   ├── organization.py      # /org/*
│   ├── auth_sso.py          # /auth/sso/*
│   └── projects.py          # ACL-aware projects
├── services/sso/            # Google OIDC, resolve_user, state
└── cli.py                   # bootstrap-org-admin
alembic/
docs/backend/                # This folder
.env                         # Feature flags (SSO_ENABLED, etc.)
```

---

## Verification

```bash
alembic upgrade head
source .venv/bin/activate && python run.py    # :9090
pytest tests/test_sso_google.py tests/test_organization.py tests/test_connectors_framework.py -q
python scripts/smoke_org_sso.py
.venv/bin/python scripts/smoke_connectors.py
curl http://localhost:9090/api/v1/crawl/auth/public-config
```


**Local UI pairing:** frontend (Server workspace) Expo web `:9191`; set `FRONTEND_BASE_URL=http://localhost:9191`.
