# Backend modules audit

Root: `/Users/arun/RAGSUITE/backend`  
Entry: `app.main:app` via `run.py` / uvicorn / gunicorn.  
No separate top-level `api/` or `models/` packages — monolith `app/models.py` + `app/routes/`.

Row format: `path | proposed module id | edition class | risk | coupling notes`

## Platform spine

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `backend/app/main.py` | — | Platform | high | App factory, lifespan, all router mounts |
| `backend/app/db.py` | — | Platform | high | Engine / sessions |
| `backend/app/auth.py` | — | Platform | high | JWT/session/deps; permission keys incl. EE (`compare:use`) |
| `backend/app/settings.py` | — | Platform | high | Env; SSO + compare flags mixed in |
| `backend/app/security_utils.py` | — | Platform | med | |
| `backend/app/limiter.py` | — | Platform | low | |
| `backend/app/worker.py` | — | Platform | high | Durable job process |
| `backend/app/services/job_queue.py` | — | Platform | high | Postgres queue |
| `backend/app/services/scheduler.py` | — | Platform | high | APScheduler from lifespan |
| `backend/app/scheduler.py` | — | Platform | low | Legacy; not imported by main |
| `backend/app/services/redis_client.py` | — | Platform | med | |
| `backend/app/services/session_store.py` | — | Platform | med | |
| `backend/app/services/auth_session.py` | — | Platform | med | |
| `backend/alembic/` | — | Platform | high | Migration runner; versions mix CE/EE |
| `backend/app/overlay/` | — | — | low | **Empty remnant** (pyc only); retired overlay approach |

## Shared / mixed packages

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `backend/app/models.py` | — | Shared | high | CE+EE tables in one file |
| `backend/app/schemas.py` | — | Shared | high | Org roles/perms schemas mixed |
| `backend/app/utils/` | — | Shared | low | csv_export used by analytics EE |
| `backend/app/cli.py` | `organization` / Platform | EE / Platform | med | Bootstrap org admin |

## Routes package (summary)

Detailed mount map: [API-ROUTE-MAP.md](./API-ROUTE-MAP.md).

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `routes/crawl.py` | `crawl` + `auth_password` | CE | high | Password auth nested under `/api/v1/crawl/auth/*` |
| `routes/rag.py` | `chat` / `search` + `compare_models` | CE + EE | high | Compare at `/search/compare*` |
| `routes/retrieve.py` | `search` | CE | low | |
| `routes/documents.py` | `documents` | CE | med | |
| `routes/n8n.py` | `connectors` | CE | low | |
| `routes/feedback_moderation.py` | `feedback` | CE | low | |
| `routes/api_keys.py` | Platform / Shared | Platform | med | API keys plumbing |
| `routes/integrations.py` | `widgets` | CE | med | Embed domains |
| `routes/projects.py` | `projects` | Shared | med | Tenant CRUD; org_id |
| `routes/onboarding.py` | `organization` / CE | EE/CE | med | |
| `routes/settings.py` | — | Platform | med | Touches org name |
| `routes/user.py` | `auth_2fa_sessions` | CE | med | Profile / 2FA |
| `routes/sessions.py` | `auth_2fa_sessions` | CE | low | |
| `routes/notifications.py` | `notifications` | Shared | low | |
| `routes/organization.py` | `organization` + `sso` | EE | high | ACL, invites, SSO admin |
| `routes/auth_sso.py` | `sso` | EE | high | Google OIDC |
| `routes/analytics.py` | `analytics` + `system_health` | EE + CE | high | Dashboard/export + health router |
| `routes/overview.py` | `analytics` / CE | EE/CE | med | Home metrics |
| `routes/integration_analytics.py` | `analytics` | EE | med | |
| `routes/prompt.py` | `chat` | CE | low | |
| `routes/webhooks.py` | Platform / CE | Platform | med | |
| `routes/chat_models.py` | `llm_providers` + `compare_models` | CE + EE | med | Compare profile sync |
| `routes/search_models.py` | `search` + `compare_models` | CE + EE | high | `profiles_router` for compare |
| `routes/embeddings.py` | `llm_providers` / `search` | CE | med | |
| `routes/chroma.py` | Platform / CE | Platform | med | Vector store ops |
| `routes/search_citation.py` | `citations` | CE | low | |
| `routes/chatbot.py` | `chat` | CE | low | |
| `routes/gmail.py` | `connectors` | CE | med | |
| `routes/connectors*.py` | `connectors` | CE | med | Drive, Notion, Confluence, SharePoint, Slack |
| `routes/clickup.py` | `connectors` | CE | low | |
| `routes/audit.py` | `audit_basic` + `audit_full` | CE/EE | high | List/get only — **no export route** |

## Services (selected)

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `services/rag/` | `chat` / `search` | CE | high | Pipeline |
| `services/connectors/` | `connectors` | CE | med | |
| `services/sso/` | `sso` | EE | high | Google OIDC |
| `services/org_invite.py` | `organization` | EE | med | |
| `services/project_permissions.py` | `organization` | EE | high | Permission catalog |
| `services/audit_service.py` | `audit_*` | CE/EE | high | |
| `services/compare_profiles.py` | `compare_models` | EE | high | |
| `services/analytics_dashboard.py` | `analytics` | EE | high | |
| `services/two_factor_service.py` | `auth_2fa_sessions` | CE | med | |
| `services/password_reset.py` | `auth_password` | CE | low | |
| `services/email_verification_service.py` | `auth_password` | CE | low | |
| `services/chat_execution_snapshot.py` | `query_tracing` | EE | med | Observability candidate |
| `services/observability.py` | `query_tracing` | EE | med | Not full CSV/JSON product yet |
| `services/concurrency_limits.py` | Platform / `organization` | Platform / EE | med | Org-aware caps |
| `services/query_runtime.py` | Shared | Shared | med | Includes compare pool |

## Ops under backend/

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `backend/docker/` | — | Platform | low | |
| `backend/configs/supervisor/` | — | Platform | low | gunicorn + worker |
| `backend/scripts/` | mixed | Platform / EE | low | e.g. `smoke_org_sso.py` EE |
| `backend/tests/` | mixed | Shared | med | See CLI-SCRIPTS-DOCKER |
