# API route map

Source: every `app.include_router(...)` in [`backend/app/main.py`](../../../backend/app/main.py).  
Also notes inline static mounts on `app`.

Row format: `prefix / router | source path | proposed module id | edition class | risk | coupling notes`

## `include_router` mounts (complete)

| prefix / router | source path | proposed module id | edition class | risk | coupling notes |
|-----------------|-------------|-------------------|---------------|------|----------------|
| `/api/v1/crawl` (`crawl_router`) | `backend/app/routes/crawl.py` | `crawl` + `auth_password` | CE | high | Auth under `/auth/*` on same router |
| `/api/v1` (`rag_router`) | `backend/app/routes/rag.py` | `chat` / `search` + `compare_models` | CE + EE | high | `/search/compare`, `/search/compare/stream` → EE |
| `/api/v1` (`retrieve_router`) | `backend/app/routes/retrieve.py` | `search` | CE | low | `POST /retrieve` |
| `/api/v1/n8n` (`n8n_router`) | `backend/app/routes/n8n.py` | `connectors` | CE | low | |
| `/api/v1/feedback` (`feedback_moderation_router`) | `backend/app/routes/feedback_moderation.py` | `feedback` | CE | low | |
| `/api/v1/documents` (`documents_router`) | `backend/app/routes/documents.py` | `documents` | CE | med | Mounted if feedback import succeeds |
| `/api/v1/api-keys` (`api_keys_router`) | `backend/app/routes/api_keys.py` | — | Platform | med | Keys plumbing |
| `/api/v1/integrations` (`integrations_router`) | `backend/app/routes/integrations.py` | `widgets` | CE | med | Widget embeds/domains |
| `/api/v1/projects` (`projects_router`) | `backend/app/routes/projects.py` | `projects` | Shared | med | Tenant |
| `/api/v1/onboarding` (`onboarding_router`) | `backend/app/routes/onboarding.py` | `organization` / CE | EE/CE | med | Org linkage |
| `/api/v1/settings` (`settings_router`) | `backend/app/routes/settings.py` | — | Platform | med | |
| `/api/v1/user` (`user_router`) | `backend/app/routes/user.py` | `auth_2fa_sessions` | CE | med | Profile / 2FA |
| `/api/v1/user/sessions` (`sessions_router`) | `backend/app/routes/sessions.py` | `auth_2fa_sessions` | CE | low | |
| `/api/v1/notifications` (`notifications_router`) | `backend/app/routes/notifications.py` | `notifications` | Shared | low | |
| `/api/v1/org` (`organization_router`) | `backend/app/routes/organization.py` | `organization` + `sso` | EE | high | Users, ACL, invites, SSO admin |
| `/api/v1/auth/sso` (`auth_sso_router`) | `backend/app/routes/auth_sso.py` | `sso` | EE | high | Google OIDC discover/start/callback |
| `/api/v1/analytics` (`analytics_router`) | `backend/app/routes/analytics.py` | `analytics` | EE | high | Dashboard, series, **export**, retry |
| `/api/v1/health` (`health_router`) | `backend/app/routes/analytics.py` | `system_health` | CE | low | Same file as analytics |
| `/api/v1/overview` (`overview_router`) | `backend/app/routes/overview.py` | `analytics` / CE | EE/CE | med | Home metrics |
| `/api/v1/analytics` (`analytics_integration_router`) | `backend/app/routes/integration_analytics.py` | `analytics` | EE | med | Per-project integration analytics |
| `/api/v1/prompt` (`prompt_router`) | `backend/app/routes/prompt.py` | `chat` | CE | low | |
| `/api/v1/webhooks` (`webhooks_router`) | `backend/app/routes/webhooks.py` | — | Platform | med | |
| `/api/v1/config-models` (`chat_models_router`) | `backend/app/routes/chat_models.py` | `llm_providers` + `compare_models` | CE + EE | med | Compare profile sync |
| `/api/v1/search/models` (`search_models_router`) | `backend/app/routes/search_models.py` | `search` | CE | med | |
| `/api/v1/search` (`search_config_router`) | `backend/app/routes/search_models.py` | `search` | CE | med | Search configuration |
| `/api/v1/search/models/profiles` (`profiles_router`) | `backend/app/routes/search_models.py` | `compare_models` | EE | high | ModelConfigProfiles for compare |
| `/api/v1/projects` (`embeddings_router`) | `backend/app/routes/embeddings.py` | `llm_providers` / `search` | CE | med | Embedding / reindex |
| `/api/v1` (`chroma_router`) | `backend/app/routes/chroma.py` | — | Platform | med | Chroma health/repair |
| `/api/v1/search/citation` (`search_citation_router`) | `backend/app/routes/search_citation.py` | `citations` | CE | low | |
| `/api/v1/chatbot` (`chatbot_router`) | `backend/app/routes/chatbot.py` | `chat` | CE | low | |
| `/api/v1/gmail` (`gmail_router`) | `backend/app/routes/gmail.py` | `connectors` | CE | med | |
| `/api/v1/connectors/gmail` (`gmail_compat_router`) | `backend/app/routes/gmail.py` | `connectors` | CE | low | Compat path |
| `/api/v1/connectors/google_drive` (`connectors_router`) | `backend/app/routes/connectors.py` | `connectors` | CE | med | |
| `/api/v1/connectors/notion` | `backend/app/routes/connectors_notion.py` | `connectors` | CE | med | |
| `/api/v1/connectors/confluence` | `backend/app/routes/connectors_confluence.py` | `connectors` | CE | med | |
| `/api/v1/connectors/sharepoint` | `backend/app/routes/connectors_sharepoint.py` | `connectors` | CE | med | |
| `/api/v1/connectors/slack` | `backend/app/routes/connectors_slack.py` | `connectors` | CE | med | |
| `/api/v1/clickup` (`clickup_router`) | `backend/app/routes/clickup.py` | `connectors` | CE | low | |
| `/api/v1/audit-events` (`audit_router`) | `backend/app/routes/audit.py` | `audit_basic` + `audit_full` | CE/EE | high | List/get; no export endpoint |

## Inline mounts on `app` (not `include_router`)

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `/rag-config.js`, widget/search-widget static, avatars, `/` | `widgets` / Platform | CE / Platform | low | Served from `main.py` |

## Acceptance — routers

- [x] Every `include_router` in `main.py` classified above
