# AI Project Memory

> Short, high-signal context for future AI sessions. Update when architecture or conventions change.

**Last updated:** 2026-07-15
**Workspace:** `/Users/arun/RAGSuite_Server` — never edit sibling `/Users/arun/RAGSuite_backend` or `/Users/arun/mobile-ragsuite`
**Source report:** [AI_PROJECT_CONTEXT_REPORT.md](./AI_PROJECT_CONTEXT_REPORT.md)
**Backend contract:** [docs/BACKEND_API_CONTRACT.md](./docs/BACKEND_API_CONTRACT.md) · gaps: [docs/BACKEND_COMPATIBILITY.md](./docs/BACKEND_COMPATIBILITY.md)

---

## What This Project Is

Expo 55 / React Native 0.83 admin client (iOS, Android, web) for RAGSuite inside the **RAGSuite_Server** workspace. Backend is `../backend` (FastAPI `:9090`, `/api/v1/*`). Prefer `npm start` at the repo root for the full Docker stack (API `:9090`, web `:9091`). Uses Axios + **Bearer JWT** (web SSO may also use cookie + `withCredentials`). Covers crawl (domain, documents, Gmail, Google Drive, Notion), chatbot/search config, analytics, audit logs, projects, **organization admin**, and more. See [docs/BACKEND_COMPATIBILITY.md](./docs/BACKEND_COMPATIBILITY.md).

## Stack at a Glance

- **Language:** TypeScript 5.9 (strict)
- **Framework:** Expo ~55, React 19, Expo Router ~55
- **Database:** N/A (client-only; no local DB)
- **Auth:** JWT Bearer from `POST /api/v1/crawl/auth/login` body; session in SecureStore (native) / localStorage (web). Backend also accepts cookies for the legacy SPA — do not assume cookie-only.
- **API:** External REST; `API_URL` = **origin** (e.g. `http://localhost:9090`); paths in `src/network/apiUrl.ts` already include `/api/v1/...`
- **Deploy:** [Assumption] Expo EAS + static web; no CI in repo — verify externally

## Structure

```text
RAGSuite_Server/frontend/
├── src/
│   ├── app/              # Expo Router routes (auth + app groups)
│   ├── features/         # Domain modules (18 folders)
│   ├── shared/           # Reusable UI, hooks, constants
│   ├── network/          # Axios client + *.actions.ts per domain
│   ├── i18n/             # Translations (en.ts + locales); product-language helper: translate-for-locale.ts
│   ├── theme/            # brand-tokens, navigation-theme
│   ├── providers/        # AppProviders composition root
│   ├── config/           # navigation, product-edition
│   └── services/storage/ # SecureStore / localStorage abstraction
├── tokens/               # design-tokens.json, tokens.css
├── envs/                 # local/staging/production API URLs
├── AGENTS.md             # Locked brand contract (READ FIRST for UI)
├── .cursor/rules/        # Agent lifecycle + UI parity rules
└── templates/            # Onboarding / context doc templates
```

| Path | Purpose |
| ---- | ------- |
| `src/app/(auth)/` | Sign-in, register, 2FA, email verify |
| `src/app/(app)/` | Authenticated shell (drawer + routes) |
| `src/app/(app)/(tabs)/` | Mobile bottom tabs (hidden on web) |
| `src/features/<domain>/` | Feature components, hooks, services, types |
| `src/network/actions/` | API call functions per domain |
| `src/shared/components/` | AppSelectField, app-drawer, form fields |
| `src/network/apiUrl.ts` | All `/api/v1/*` endpoint paths (must match backend catalog) |
| `env.json` | Runtime `API_URL` origin (copy from `envs/` via `yarn env:local`) |
| `docs/BACKEND_API_CONTRACT.md` | Backend architecture + endpoint families for agents |

## Critical Decisions

- **Backend architecture wins** — when integrating APIs, prefer `/Users/arun/RAGSuite_Server/backend` docs (`docs/backend/*`, `docs/frontend/*`) over legacy monorepo assumptions or inventing paths.
- **Brand tokens are locked** — use `tokens/design-tokens.json` / `AGENTS.md`; never invent colors or hardcode hex.
- **Feature-module layout** — one folder per domain under `src/features/`; API actions mirror in `src/network/actions/`.
- **Expo Router file routes** — `src/app/` is the navigation source of truth; route names in `src/config/navigation.ts`.
- **Web is first-class** — permanent drawer on web, compact breakpoint 900px (`COMPACT_LAYOUT_BREAKPOINT`).
- **Reference UI parity beats creativity** — when screenshots/references exist, match exactly (`.cursor/rules/reference-ui-parity.mdc`).
- **Major tasks require full lifecycle** — plan → implement → QA → review per `.cursor/rules/system.md`.
- **Gmail ≠ connectors namespace** — Gmail is `/api/v1/gmail/*`; Drive/Notion (and future Confluence/SharePoint/Slack) are `/api/v1/connectors/{type}/*`.
- **Search ↔ Chatbot config parity** — Chatbot nav icons, model API-key UX, and connection-test parsing should mirror Search unless product requires a deliberate difference (skill: `.cursor/skills/chatbot-search-config-parity/`).
- **Product language ≠ dashboard locale** — Chatbot widget language / search-box language drive end-user widget & feedback copy via `createTranslatorForLanguage` / `translateForLocale`; `useTranslation()` is for admin chrome only.

## Conventions (Easy to Violate)

- Import via `@/` alias only; no deep relative paths.
- All user-facing strings through `useTranslation()` / `t('key')`; sync locales with `yarn sync-i18n`.
- **Exception:** Embedded chatbot / search-test feedback UI must use **product language** (`config.language` / search-box language), not the admin app locale.
- Toolbar controls share height `TOOLBAR_CONTROL_HEIGHT` (44) — search + inline `AppSelectField`.
- On web, never nest `Pressable` with `accessibilityRole="button"` inside another button (invalid DOM).
- Reuse panel patterns: `CrawlPanelCard`, `ConfigurationPanelCard`, `CrawlMobileFilterSection`, `TableHeaderLabel`.
- `AppSwitchRow`: use `transparentBackground` when nested on tinted/muted surfaces — default `colors.surface` creates “white boxes inside beige”.
- Tabular lining numerals for all metrics/numbers (AGENTS.md §1).
- Ochre is graphic accent only — never body text.

## Common Pitfalls

- Forgetting `yarn env:local` before start — API calls fail without `env.json`.
- Setting `API_URL` to `…/api/v1` without checking path joins — prefer origin + `/api/v1/...` in `apiUrl.ts`.
- Inventing `POST /auth/login` — real path is `POST /api/v1/crawl/auth/login`.
- Putting Gmail under `/connectors/gmail` — wrong; use `/gmail`.
- Building OAuth redirect URIs without `/api/v1` (e.g. `/connectors/notion/auth/callback`) — must be `/api/v1/connectors/...` (Gmail: `/api/v1/gmail/auth/callback`).
- Using `AppSelectField` `variant="inline"` in toolbars without `controlHeight={TOOLBAR_CONTROL_HEIGHT}` — misaligned rows.
- Creating parallel UI primitives instead of extending existing crawl/configuration patterns.
- Confusing [docs/WEB_MOBILE_PARITY.md](./docs/WEB_MOBILE_PARITY.md) (legacy UI parity) with [docs/BACKEND_COMPATIBILITY.md](./docs/BACKEND_COMPATIBILITY.md) (API gaps).
- Assuming README is accurate — see [README.md](./README.md) and [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for setup.
- Only 3 Jest tests exist — do not assume coverage; run manual QA for UI changes.
- `yarn tsc --noEmit` reports ~31 pre-existing errors — avoid introducing new ones.
- **Model connection test:** unwrap `response.data` before reading `chat_model` / `embedding_model`; `parseConnectionTestResult(undefined)` returns **ok:true** — false “Connection successful”.
- **API key field:** keep editable `apiKey` empty when a key is already stored; track presence with `apiKeyMasked` / `isSavedApiKeyMarker` — never put masked/plaintext into the input; do not treat arbitrary short `api_key` as saved.
- **Org project assignments:** project vs app-modules hierarchy; avoid nested white `AppSwitchRow` surfaces on muted blocks.
- **Web:** `Alert.alert` is unreliable — prefer confirm / inline actions (e.g. notifications delete-all).

## Active Development

- Backend compatibility: Confluence/SharePoint/Slack crawl panels (G5); org/SSO/public-config **shipped on web** (G1–G3, G7).
- Brand system enforcement across all screens (`AGENTS.md`, commit `8fc5725`).
- Crawl module web UI parity (toolbar, list columns, document grid).
- i18n expansion and `sync-i18n` workflow; product-language feedback forms (chatbot widget + search test).
- Shared component refactors (AppSelectField anchored picker, dependency updates).
- Organization members / project module permissions UX; chatbot↔search model-settings parity.

## When Touching X, Also Check Y

| If you change... | Also verify... |
| ---------------- | -------------- |
| `src/network/apiUrl.ts` | Matching action file + feature types/mappers + [BACKEND_API_CONTRACT.md](./docs/BACKEND_API_CONTRACT.md) |
| Crawl OAuth utils | Redirect URI includes `/api/v1` and correct Gmail vs connectors path |
| `src/config/navigation.ts` | Drawer items, header meta, i18n title keys; org “All Projects” → `/projects` |
| `AppSelectField` | All inline toolbar usages (crawl, audit logs, notifications, training) |
| Crawl list/grid components | Web breakpoints, horizontal scroll, column alignment; Drive/Notion panels |
| Auth/session flow | Web localStorage + native SecureStore; 401 interceptor; crawl auth paths |
| Brand colors / theme | `tokens/design-tokens.json`, `AGENTS.md`, `brand-tokens.ts` |
| i18n keys in `en.ts` | Run `yarn sync-i18n`; check other locale files |
| New Expo route | `(app)/_layout.tsx` drawer options, `navigation.ts` route registry |
| Chatbot model settings / test connection | Search equivalent panels + `isSavedApiKeyMarker` / envelope unwrap |
| Chatbot widget feedback UI | `config.language` → `createTranslatorForLanguage`; Search Test feedback language |
| `AppSwitchRow` default surface | Call sites on tinted parents need `transparentBackground` |
| Org assign-projects sheet | Workspace create toggle + per-project modules; no nested white boxes |

## High-Risk Zones

Do not modify without extra care:

- `src/features/auth/` and `src/network/auth-session.ts`
- API key create/reveal/delete (`src/features/configuration/`)
- Document upload and crawl indexing / connector OAuth (`src/features/crawl/`)
- Chat widget streaming (`src/features/app-chat-widget/`) — Bearer on SSE
- Chatbot / search **model API keys** and test-connection (`ModelSettingsPanel`, `*ApiKeyConnectionHint`, service test helpers)
- Project embedding reindex (`projects.actions.ts`)
- Audit logs export and filters
- Organization invites / roles / project ACL (`src/features/organization/`)

## Verification Checklist

```bash
yarn install       # install
yarn env:local     # configure API URL
yarn start         # run locally
yarn test          # run tests (3 files)
yarn lint          # lint
yarn tsc --noEmit  # typecheck
```

Before claiming done:

- [ ] Tests pass
- [ ] Lint passes
- [ ] No unrelated files changed
- [ ] Web UI checked at 1280 / 1024 / 900 / 720 if layout touched
- [ ] Loading, empty, error states present for changed screens
- [ ] No new hardcoded colors outside brand tokens

## Quick Links

- Documentation index: [docs/README.md](./docs/README.md)
- Backend API contract: [docs/BACKEND_API_CONTRACT.md](./docs/BACKEND_API_CONTRACT.md)
- Backend compatibility gaps: [docs/BACKEND_COMPATIBILITY.md](./docs/BACKEND_COMPATIBILITY.md)
- Developer quick start: [README.md](./README.md)
- Full report: [AI_PROJECT_CONTEXT_REPORT.md](./AI_PROJECT_CONTEXT_REPORT.md)
- Human context: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
- Brand contract: [AGENTS.md](./AGENTS.md)
- Backend skill: [.cursor/skills/ragsuite-backend-contract/SKILL.md](./.cursor/skills/ragsuite-backend-contract/SKILL.md)
- Chatbot↔Search config skill: [.cursor/skills/chatbot-search-config-parity/SKILL.md](./.cursor/skills/chatbot-search-config-parity/SKILL.md)
- Agent lifecycle: [.cursor/rules/system.md](./.cursor/rules/system.md)
- UI parity rules: [.cursor/rules/reference-ui-parity.mdc](./.cursor/rules/reference-ui-parity.mdc)
- Onboarding workflow: [PROJECT_ONBOARDING_PROMPT.md](./PROJECT_ONBOARDING_PROMPT.md)
