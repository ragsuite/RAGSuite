# Module candidates (feeds Phase 3)

Aligned to [ADR-002-modules.md](../ADR-002-modules.md).  
Boundaries are **logical** — code still lives in the monolith until Phase 2–5.

## Independence rule (reminder)

No module may directly import another module. Cross-talk via Platform contracts/events only.

## Platform (not a module)

Owns: auth protocol, db, router/API shell, events, permissions protocol, storage, settings, CLI lifecycle hooks, configuration, extension loader (future), job queue/worker/scheduler.

Key paths: `backend/app/{main,db,auth,settings}.py`, `services/job_queue.py`, `worker.py`, `cli/`, `scripts/`, `docker/`.

## Community modules

| id | boundary | primary paths | notes |
|----|----------|---------------|-------|
| `crawl` | Site crawl jobs & UI | `features/crawl/`, `routes/crawl.py` (non-auth) | Split auth out of crawl router |
| `documents` | Upload, ingest, preview | `routes/documents.py`, document actions | |
| `chat` | Assistant + chatbot config | `chatbot-config/`, `routes/chatbot.py`, rag chat | Exclude compare |
| `search` | AI Search + retrieve | `search-config/`, `retrieve.py`, search config routes | Exclude profiles/compare |
| `widgets` | Embeds / in-app widget | `app-chat-widget/`, `integrations.py` | |
| `connectors` | Gmail, Drive, Notion, Confluence, SharePoint, Slack, n8n, ClickUp, MCP | `routes/connectors*`, `gmail`, `n8n`, `clickup` | |
| `llm_providers` | Provider registry / model configs | `chat_models.py`, `configuration/` | Exclude compare sync |
| `citations` | Citation formatting | `search_citation.py` | |
| `feedback` | Feedback collection/moderation | `feedback-moderation/` | |
| `auth_password` | Password register/login/reset/verify | crawl `/auth/*`, auth screens | Platform owns tokens |
| `auth_2fa_sessions` | 2FA + session list/revoke | `user.py`, `sessions.py` | |
| `system_health` | Health UI + `/api/v1/health` | `system-health/`, `health_router` | Split from analytics.py |
| `audit_basic` | Audit list · 30d retention policy | `audit-logs/`, `audit.py` | Shares table with `audit_full` |

## Enterprise modules

| id | boundary | primary paths | notes |
|----|----------|---------------|-------|
| `sso` | SSO/OIDC (SAML later) | `auth_sso.py`, `services/sso/`, SSO UI | Google only today |
| `organization` | Org → users → project ACL (Teams later) | `organization.py`, `features/organization/` | |
| `audit_full` | Full audit + exports | extends audit | Export API gap |
| `compliance` | Retention / legal hold / compliance exports | settings retention | Legal hold gap |
| `compare_models` | Compare Models | `compare-models/`, rag compare, `profiles_router` | |
| `query_tracing` | Deep tracing + exports | chat-history trace, observability | Export gap |
| `analytics` | Advanced analytics + CSV export | `analytics/`, analytics routes | |
| `mobile_beta` | Mobile Beta entitlement | mobile-integration, Expo native | Entitlement gap |

## Shared candidates

| id | boundary | primary paths | notes |
|----|----------|---------------|-------|
| `projects` | Project tenant CRUD + active project | `projects.py`, `features/projects/` | Used by CE+EE; not edition-gated |
| `notifications` | In-app notifications | `notifications.py` | Cross-cutting |

Optional: fold `notifications` into Platform later if it never needs independent release.

## Onboarding / home / profile / settings UI

| surface | assignment |
|---------|------------|
| `features/onboarding/` | Mostly `organization` + CE bootstrap |
| `features/home/` | Prefer `analytics` (EE) vs lightweight CE overview — **split candidate** |
| `features/profile/` | `auth_2fa_sessions` / Shared |
| `features/settings/` | Platform settings + `compliance` retention panels |
| `features/configuration/` | `llm_providers` |

## Phase 3 input

1. Manifest per module id above.  
2. Extract EE modules first for public CE cleanliness (`sso`, `organization`, `compare_models`, `analytics`, `audit_full`, `compliance`, `query_tracing`, `mobile_beta`).  
3. Peel password auth out of `crawl` router.  
4. Split `health_router` from `analytics.py`.
