# Classification matrix

Pricing source: [ragsuite.de/pricing/#comparison](https://www.ragsuite.de/pricing/#comparison)  
Module IDs: [ADR-002](../ADR-002-modules.md) · [FEATURE-MATRIX](../FEATURE-MATRIX.md)

Columns: pricing feature → module id → class → representative paths

## Platform

| pricing feature | module id | class | paths |
|-----------------|-----------|-------|-------|
| REST API shell · keys · webhooks plumbing | — | Platform | `backend/app/main.py`, `routes/api_keys.py`, `routes/webhooks.py` |
| Docker / deploy / ports | — | Platform | `docker/`, `docker-compose*.yml`, `scripts/native-*.sh` |
| Extension loader (future) | — | Platform | *(absent — Phase 4)* |
| Settings / configuration store | — | Platform | `backend/app/settings.py`, `routes/settings.py`, `frontend/.../features/settings/` |
| Auth protocol · DB · sessions store | — | Platform | `backend/app/auth.py`, `db.py`, `services/session_store.py`, `services/auth_session.py` |
| Jobs / worker / scheduler | — | Platform | `worker.py`, `services/job_queue.py`, `services/scheduler.py` |
| CLI lifecycle | — | Platform | `cli/src/commands/{init,start,stop,doctor,update,...}` |
| Users · Projects limits (commercial) | — | Platform + license | Seat enforcement **absent**; projects unlimited in code |

## Community modules

| pricing feature | module id | class | paths |
|-----------------|-----------|-------|-------|
| Full pipeline — crawl | `crawl` | CE | `features/crawl/`, `routes/crawl.py`, crawl jobs |
| Full pipeline — upload | `documents` | CE | `routes/documents.py`, `network/actions/document.actions.ts`, documents routes |
| Full pipeline — chat | `chat` | CE | `features/chatbot-config/`, `routes/chatbot.py`, `routes/rag.py` (non-compare), `routes/prompt.py` |
| Full pipeline — search | `search` | CE | `features/search-config/`, `routes/retrieve.py`, `search_models`/`search_config`, embeddings |
| Full pipeline — widgets | `widgets` | CE | `features/app-chat-widget/`, `routes/integrations.py`, widget static in `main.py` |
| Connectors & MCP — Gmail, n8n, MCP, Marketplace | `connectors` | CE | `routes/gmail.py`, `connectors*.py`, `n8n.py`, `clickup.py`, connector actions |
| All LLM providers incl. Ollama | `llm_providers` | CE | `routes/chat_models.py`, `features/configuration/`, embedding routes |
| Citations | `citations` | CE | `routes/search_citation.py` |
| Feedback | `feedback` | CE | `features/feedback-moderation/`, `routes/feedback_moderation.py` |
| 2FA & sessions | `auth_2fa_sessions` | CE | `routes/user.py`, `routes/sessions.py`, `services/two_factor_service.py` |
| System health | `system_health` | CE | `features/system-health/`, `health_router` in `analytics.py` |
| Audit logs — Basic · 30 days | `audit_basic` | CE | `features/audit-logs/`, `routes/audit.py`, `audit_events` (retention policy later) |
| Password auth | `auth_password` | CE | `routes/crawl.py` `/auth/*`, auth feature (non-SSO) |

## Enterprise modules (code already in CE tree)

| pricing feature | module id | class | paths |
|-----------------|-----------|-------|-------|
| SSO / SAML / OIDC | `sso` | EE | `routes/auth_sso.py`, `services/sso/`, `organization-sso` UI, `SSO_*` env (**Google OIDC only today**) |
| RBAC · org → teams → users | `organization` | EE | `routes/organization.py`, `features/organization/`, org memberships/ACL (**Teams gap**) |
| Audit logs — Full + exports | `audit_full` | EE | Same audit UI/API; **export route missing** |
| Compliance · retention / legal hold | `compliance` | EE | Settings retention panels; **legal hold missing** |
| Compare Models | `compare_models` | EE | `features/compare-models/`, `rag.py` compare, `profiles_router`, `COMPARE_MODEL_*` |
| Deep query tracing + CSV/JSON exports | `query_tracing` | EE | chat-history trace UI, `observability.py`, `chat_execution_snapshot.py` (**export product incomplete**) |
| Advanced analytics | `analytics` | EE | `features/analytics/`, `routes/analytics.py`, `integration_analytics.py`, `analytics_days` |
| Mobile app (Beta) | `mobile_beta` | EE | Expo mobile targets + `mobile-integration` screen; entitlement gating **absent** |
| Voice input + AI VoiceOver | `voice` | EE | Browser STT/TTS on chatbot and search widgets; CE slots render null |

## Shared

| pricing feature | module id | class | paths |
|-----------------|-----------|-------|-------|
| Projects (tenant workspace) | `projects` | Shared | `routes/projects.py`, `features/projects/`, active-project provider |
| Notifications | `notifications` | Shared | `routes/notifications.py`, `features/notifications/` |
| ORM/schemas monolith | — | Shared | `backend/app/models.py`, `schemas.py` |

## By agreement (not modules yet)

| pricing feature | module id | class | paths |
|-----------------|-----------|-------|-------|
| White-label · custom widget domain | — | by-agreement | Partial widget domain config in integrations; not productized service |
| SLA / CSM / onboarding services | — | by-agreement | Process only |
| Air-gapped support | — | by-agreement | Offline license/bundle Phase 8–10 |
| SCIM · SIEM · usage meters | — | by-agreement | **No code** |
