# Module Guide

> **When touching a module, start here.** Trace: route → screen → hook → actions → mapper.

## Module index

| Module | Primary routes | Key hooks / providers | Network actions | Risk |
| ------ | -------------- | --------------------- | --------------- | ---- |
| **auth** | `(auth)/*`, `login/callback` | `useSession`, `SessionProvider`, `usePublicAuthConfig` | `auth.actions.ts`, `public-config.actions.ts` | High — tokens, 2FA, SSO cookie hydrate |
| **organization** | `/organization`, `/projects` (All Projects) | `OrganizationScreen` (admin-gated; panel-only routes) | `org.actions.ts` | High — invites, SSO, project ACL |
| **onboarding** | `/onboarding` | `use-onboarding-flow` | `onboarding.actions.ts` | Medium — first-run gate |
| **home** | `/(tabs)` index | `use-home-overview` | `analytics.actions.ts` | Low |
| **analytics** | `/analytics` | `useAnalytics` (via screen) | `analytics.actions.ts` | Low |
| **projects** | `/projects` | `useProjects`, `ActiveProjectProvider` | `projects.actions.ts` | High — reindex |
| **crawl** | `/crawl-management`, `/documents` | `useCrawlManagement`, `useCrawlLayout`, `useNotionConnector`, `useGoogleDriveConnector` | `crawl.actions.ts`, `document.actions.ts`, `gmail.actions.ts`, `google-drive.actions.ts`, `notion.actions.ts` | High — upload, delete, OAuth |
| **configuration** | `/configuration` | `useConfiguration`, `ConfigurationProvider` | `configuration.actions.ts` | High — API keys |
| **chatbot-config** | `/chatbot-config/*` | `useChatbotConfig`, `ChatbotConfigProvider` | `chatbot-config.actions.ts` | Medium–High — model API keys / test-connection |
| **search-config** | `/search-config/*` | `useSearchConfig`, `SearchConfigProvider` | `search-config.actions.ts` | Medium–High — model API keys / test-connection (canonical for chatbot parity) |
| **app-chat-widget** | Global host | `useAppChatWidget`, `AppChatWidgetProvider` | `app-chat-widget.actions.ts` | High — streaming + product-language feedback |
| **chat-history** | `/history/*` | Screen-level hooks | `chat-history.actions.ts` | Medium |
| **compare-models** | `/compare-models` | `useCompareModels` | `compare-models.actions.ts` | Medium |
| **feedback-moderation** | `/feedback-moderation/*` | `useFeedbackModeration` | `feedback-moderation.actions.ts` | Low |
| **audit-logs** | `/audit-logs/*` | `useAuditLogs`, `useAuditEventDetail` | `audit-log.actions.ts` | Medium — compliance |
| **notifications** | `/notifications` | `useNotifications` | `notifications.actions.ts` | Low — web: avoid `Alert.alert`; use bulk delete API |
| **system-health** | `/system-health` | Service hooks | `system-health.actions.ts` | Low |
| **settings** | `/settings/*`, tab | `useSettings`, `SettingsProvider` | `settings.actions.ts` | Medium |
| **profile** | `/profile` | Profile hooks | `profile.actions.ts` | Medium — PII |

## When touching X, also check Y

| If you change... | Also verify... |
| ---------------- | -------------- |
| `src/network/apiUrl.ts` | Matching `*.actions.ts` + mappers + [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md) |
| Crawl OAuth utils | Redirect URIs: Gmail `/api/v1/gmail/auth/callback`; Drive/Notion `/api/v1/connectors/{type}/auth/callback` |
| `src/config/navigation.ts` | Drawer items, `app-drawer.tsx`, i18n title keys |
| `AppSelectField` | Crawl, audit-logs, notifications, training history toolbars |
| Crawl components | `useCrawlLayout`, panels for all five tabs, web breakpoints |
| Auth / session | `auth-session.ts`, storage, 401 interceptor, onboarding gate; paths under `/crawl/auth`; web SSO uses cookie + `withCredentials` |
| Organization | Admin-only drawer item; `/org/*` actions; do not show to non-admins |
| Active project | All project-scoped API calls (`project_id`), embedding banners |
| Chatbot config | `ChatbotConfigProvider`, widget host, training routes |
| Search config | `SearchConfigProvider`, search history routes |
| Brand / theme | `AGENTS.md`, `brand-tokens.ts`, `tokens/design-tokens.json` |
| i18n keys | `en.ts`, `yarn sync-i18n`, header meta in `navigation.ts` |
| New Expo route | `(app)/_layout.tsx`, drawer visibility, header meta |

## Per-module entry points

### auth

- Routes: `src/app/(auth)/`
- Provider: `src/features/auth/providers/session-provider.tsx`
- Constants: `src/features/auth/auth.constants.ts`
- Storage key via `AUTH_STORAGE_KEY`

### onboarding

- Route: `src/app/(app)/onboarding.tsx`
- Flow: `src/features/onboarding/hooks/use-onboarding-flow.ts`
- QA: [QA_ONBOARDING.md](./QA_ONBOARDING.md)

### crawl

- Screen: `src/features/crawl/screens/CrawlManagementScreen.tsx`
- Tabs: **domain** | **document** | **gmail** | **google-drive** | **notion**
- Panels: `CrawlDomainPanel`, `CrawlDocumentPanel`, `CrawlGmailPanel`, `CrawlGoogleDrivePanel`, `CrawlNotionPanel`
- Layout: `src/features/crawl/utils/crawl-layout.ts`, `useCrawlLayout`
- OAuth URI helpers: `utils/gmail-oauth.ts`, `google-drive-oauth.ts`, `notion-oauth.ts`, `connector-oauth.ts`
- Types: `crawl.types.ts`, `google-drive.types.ts`, `notion.types.ts`
- Backend: Gmail → `/api/v1/gmail/*`; Drive/Notion → `/api/v1/connectors/{type}/*` (see [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md))
- Not in UI yet (APIs shipped): Confluence, SharePoint, Slack — gap G5 in [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md)

### configuration

- Screen: `src/app/(app)/configuration.tsx`
- Cards: `ConfigurationPanelCard`, API key table, N8n panel
- Sheets: `ConfigurationSheet`, `ApiKeyCreatedSheet`

### chatbot-config

- Layout: `src/app/(app)/chatbot-config/_layout.tsx`
- Provider: `ChatbotConfigProvider`
- Settings panels under `components/settings/`
- Training under `components/training/`
- **Parity with search-config:** primary + settings + training nav icons; model API-key empty field + saved marker; connection-test response unwrap — see skill `chatbot-search-config-parity`
- Key files: `ModelSettingsPanel.tsx`, `ChatbotModelApiKeyConnectionHint.tsx`, `chatbot-config.service.ts` (`testModelConnection`, `saveModelSettings`)

### search-config

- Mirror structure of chatbot-config (often the **canonical** implementation for chatbot to copy)
- Provider: `SearchConfigProvider`
- Training/history under `components/training/`
- Key files: `ModelSettingsPanel.tsx`, `SearchModelApiKeyConnectionHint.tsx`, `search-config.service.ts` (`testSearchModelConnection`)
- Search Test feedback: pass search-box `language` into `SearchTestFeedbackForm` (product language, not admin locale)

### app-chat-widget

- Host: `src/features/app-chat-widget/components/AppChatWidgetHost.tsx`
- Stream: `src/features/app-chat-widget/utils/app-chat-widget-stream.ts`
- Display: `app-chat-widget-display.tsx`
- Feedback UI: `AppChatWidgetInlineFeedback` / `AppChatWidgetFeedbackModal` — translate with `createTranslatorForLanguage(config.language)`

### organization

- Routes are panel-based (`panel=` settings / users / sso); no in-page tab bar — Management drawer items
- “All Projects” navigates to `/projects` (not a separate org-projects list)
- Project assignments sheet: `AssignProjectsSheet` + `ProjectModulePermissions` — workspace create toggle + per-project modules; use `AppSwitchRow` with `transparentBackground` on tinted rows
- Member row: Admin label (not “Org admin”); deactivate/delete; protect self-actions via `currentUserId`

### embedding (cross-cutting)

- Actions: `src/network/actions/embedding.actions.ts`
- Banners in chatbot/search config settings panels
- Project actions: `projectReindex`, `projectEmbeddingStatus`

## Shared embedding / project context

Many modules depend on **active project** from `ActiveProjectProvider` (`src/features/projects/providers/active-project-provider.tsx`). Changing project switch behavior affects crawl, config bundles, and analytics.

## Related docs

- [PRODUCT.md](./PRODUCT.md) — routes and navigation
- [ARCHITECTURE.md](./ARCHITECTURE.md) — data flow
- [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md) — backend endpoints
- [TESTING_AND_QA.md](./TESTING_AND_QA.md) — verification
