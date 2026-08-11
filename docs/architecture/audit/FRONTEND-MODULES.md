# Frontend modules audit

Root: `/Users/arun/RAGSUITE/frontend`  
Row format: `path | proposed module id | edition class | risk | coupling notes`

## `src/` top-level

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `frontend/src/app/` | — (shell) | Platform | med | Expo Router entry; mounts all feature screens |
| `frontend/src/components/` | — | Shared | low | Cross-cutting UI |
| `frontend/src/config/` | — | Platform | med | `navigation.ts`, `product-edition.ts` |
| `frontend/src/constants/` | — | Shared | low | |
| `frontend/src/features/` | *(per folder below)* | mixed | high | Primary product surface |
| `frontend/src/hooks/` | — | Shared | low | |
| `frontend/src/i18n/` | — | Shared | med | Includes EE strings (audit/compliance labels) |
| `frontend/src/network/` | — | Platform | med | HTTP client + session |
| `frontend/src/network/actions/` | *(per file)* | mixed | high | Mirrors features |
| `frontend/src/providers/app-providers.tsx` | — | Platform | med | Composes feature providers |
| `frontend/src/services/` | — | Platform | low | Thin API/storage |
| `frontend/src/shared/` | — | Shared / Platform | med | Drawer, guards, toast, brand badge |
| `frontend/src/store/` | — | Shared | low | |
| `frontend/src/theme/` | — | Platform | low | |
| `frontend/src/types/` | — | Shared | low | |
| `frontend/src/utils/` | — | Shared | low | |

## Feature folders (all 19)

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `frontend/src/features/analytics/` | `analytics` | EE | high | Advanced dashboards/export; drawer “home” maps here |
| `frontend/src/features/app-chat-widget/` | `widgets` | CE | med | In-app chat widget |
| `frontend/src/features/audit-logs/` | `audit_basic` + `audit_full` | CE/EE | high | Same UI; split by retention/export later |
| `frontend/src/features/auth/` | `auth_password` / `auth_2fa_sessions` / `sso` | CE + EE | high | Password/2FA = CE; SSO CTA/callback = EE |
| `frontend/src/features/chat-history/` | `chat` + `query_tracing` | CE + EE | high | History = CE; source trace / timing spans = EE |
| `frontend/src/features/chatbot-config/` | `chat` + `llm_providers` | CE | med | Includes mobile-integration screen (see EE) |
| `frontend/src/features/compare-models/` | `compare_models` | EE | high | Full feature in tree; pricing allows locked teaser |
| `frontend/src/features/configuration/` | `llm_providers` / Shared | CE | med | Model/config UX |
| `frontend/src/features/crawl/` | `crawl` + `documents` | CE | med | Crawl + document upload progress provider |
| `frontend/src/features/feedback-moderation/` | `feedback` | CE | low | |
| `frontend/src/features/home/` | `analytics` / Shared | EE/CE | med | Overview; overlaps analytics |
| `frontend/src/features/notifications/` | `notifications` | Shared | low | In-app alerts |
| `frontend/src/features/onboarding/` | `organization` / CE | EE/CE | med | Org linkage onboarding |
| `frontend/src/features/organization/` | `organization` + `sso` | EE | high | RBAC ACL, SSO panel, org admin provider |
| `frontend/src/features/profile/` | `auth_2fa_sessions` / Shared | CE | low | User profile |
| `frontend/src/features/projects/` | `projects` | Shared | med | Tenant workspace; org-aware |
| `frontend/src/features/search-config/` | `search` | CE | med | |
| `frontend/src/features/settings/` | Platform + `compliance` | Platform / EE | med | Retention panel → compliance candidate |
| `frontend/src/features/system-health/` | `system_health` | CE | low | |

## App routes (Expo)

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `frontend/src/app/_layout.tsx` | — | Platform | med | Root providers |
| `frontend/src/app/(auth)/*` | `auth_password` / `auth_2fa_sessions` / `sso` | CE + EE | med | Includes `login/callback` (SSO) |
| `frontend/src/app/(app)/_layout.tsx` | — | Platform | med | Drawer + guards |
| `frontend/src/app/(app)/(tabs)/*` | mixed CE | CE | med | crawl, chatbot, search, settings tabs |
| `frontend/src/app/(app)/analytics.tsx` | `analytics` | EE | high | |
| `frontend/src/app/(app)/compare-models/` | `compare_models` | EE | high | |
| `frontend/src/app/(app)/audit-logs/` | `audit_*` | CE/EE | high | |
| `frontend/src/app/(app)/organization*.tsx` | `organization` / `sso` | EE | high | users, projects, SSO, settings |
| `frontend/src/app/(app)/history/` | `chat` + `query_tracing` | CE + EE | med | |
| `frontend/src/app/(app)/documents*` / crawl tabs | `documents` / `crawl` | CE | med | |
| `frontend/src/app/(app)/feedback-moderation*` | `feedback` | CE | low | |
| `frontend/src/app/(app)/system-health*` | `system_health` | CE | low | |
| `frontend/src/app/(app)/chatbot-config/mobile-integration.tsx` | `mobile_beta` / `widgets` | EE / CE | med | Mobile integration UI; Expo app itself is CE runtime |
| `frontend/src/app/(app)/settings/data-retentions*` | `compliance` | EE | med | Retention; legal hold absent |
| `frontend/src/app/(app)/settings/licenses*` | — | Shared | low | Legal copy, not EE license keys |

## Navigation / edition gating

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `frontend/src/config/navigation.ts` | — | Platform | high | Drawer sections; org-admin filter only — **no edition filter** |
| `frontend/src/config/product-edition.ts` | — | Platform | low | Cosmetic `getProductEdition()` |
| `frontend/src/shared/components/brand/edition-badge.tsx` | — | Platform | low | CE/EE/Beta pills |
| `frontend/src/shared/components/navigation/app-drawer.tsx` | — | Platform | med | Shows edition badge |
| `frontend/src/shared/components/navigation/workspace-route-guard.tsx` | `organization` / Platform | EE / Platform | med | Workspace access |

## Network actions

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `network/actions/analytics.actions.ts` | `analytics` | EE | high | |
| `network/actions/app-chat-widget.actions.ts` | `widgets` | CE | low | |
| `network/actions/audit-log.actions.ts` | `audit_*` | CE/EE | high | |
| `network/actions/auth.actions.ts` | `auth_password` / `sso` | CE + EE | high | |
| `network/actions/chat-history.actions.ts` | `chat` / `query_tracing` | CE + EE | med | |
| `network/actions/chatbot-config.actions.ts` | `chat` | CE | low | |
| `network/actions/compare-models.actions.ts` | `compare_models` | EE | high | |
| `network/actions/configuration.actions.ts` | `llm_providers` | CE | low | |
| `network/actions/crawl.actions.ts` | `crawl` | CE | low | |
| `network/actions/document.actions.ts` | `documents` | CE | low | |
| `network/actions/embedding.actions.ts` | `llm_providers` / `search` | CE | low | |
| `network/actions/feedback-moderation.actions.ts` | `feedback` | CE | low | |
| `network/actions/{gmail,google-drive,notion,confluence,sharepoint,slack}.actions.ts` | `connectors` | CE | med | |
| `network/actions/notifications.actions.ts` | `notifications` | Shared | low | |
| `network/actions/onboarding.actions.ts` | `organization` / CE | EE/CE | med | |
| `network/actions/org.actions.ts` | `organization` / `sso` | EE | high | |
| `network/actions/profile.actions.ts` | Shared | CE | low | |
| `network/actions/projects.actions.ts` | `projects` | Shared | med | |
| `network/actions/public-config.actions.ts` | Platform | Platform | low | |
| `network/actions/search-config.actions.ts` | `search` | CE | low | |
| `network/actions/settings.actions.ts` | Platform | Platform | low | |
| `network/actions/system-health.actions.ts` | `system_health` | CE | low | |
| `network/apiUrl.ts` | — | Platform | med | Declares `/auth/sso`, `/org/sso`, analytics, audit URLs |

## Providers

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `providers/app-providers.tsx` | — | Platform | med | |
| `features/auth/providers/session-provider.tsx` | Platform / `auth_*` | Platform | high | Session spine |
| `features/organization/providers/org-admin-access-provider.tsx` | `organization` | EE | high | |
| `features/projects/providers/active-project-provider.tsx` | `projects` | Shared | med | |
| `features/app-chat-widget/providers/*` | `widgets` | CE | low | |
| `features/crawl/providers/document-upload-progress-provider.tsx` | `documents` | CE | low | |
| `features/notifications/providers/*` | `notifications` | Shared | low | |

## Acceptance — frontend

- [x] Every `features/*` folder classified
- [x] EE surfaces called out (SSO, org, audit, analytics, compare, tracing, mobile entitlement)
- [x] Edition badge documented as non-gating
