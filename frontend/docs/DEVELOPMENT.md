# Development Guide

## Prerequisites

- Node.js (LTS recommended)
- Yarn 1.x
- For native: Xcode (iOS) / Android Studio (Android)
- For web: modern Chromium-based browser

## Initial setup

```bash
yarn install
yarn env:local          # copies envs/local.json → env.json (required)
yarn start              # Expo dev server — press w for web, i for iOS, a for Android
# or
yarn web                # web-only dev server
```

## Environment configuration

| File | Purpose |
| ---- | ------- |
| `envs/local.json` | Local / dev API URL template |
| `envs/staging.json` | Staging API URL |
| `envs/production.json` | Production API URL |
| `env.json` | **Runtime config** (gitignored; created by `yarn env:*`) |

Switch environment:

```bash
yarn env:local
yarn env:staging
yarn env:production
```

`API_URL` is read in `src/network/apiUrl.ts` from `env.json`.

**Backend pairing (RAGSuite_Server backend):** set `API_URL` to the API **origin** only (dev default `http://localhost:9090`, or an ngrok tunnel host). Paths already include `/api/v1/...` in `apiUrl.ts`. Full contract: [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md). Do not confuse this with the legacy Vite SPA, which often sets `VITE_API_BASE_URL` to `…/api/v1` and uses cookies.

## Scripts

| Command | Purpose |
| ------- | ------- |
| `yarn start` | Expo dev server (all platforms) |
| `yarn web` | Web dev server |
| `yarn android` | Run on Android |
| `yarn ios` | Run on iOS |
| `yarn lint` | ESLint via expo lint |
| `yarn test` | Jest (3 test files currently) |
| `yarn sync-i18n` | Sync locale files from `en.ts` |
| `yarn tsc --noEmit` | Typecheck (manual — not in package.json) |

## Project layout (quick)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for full detail.

- Routes: `src/app/`
- Features: `src/features/<domain>/`
- API: `src/network/actions/`
- Shared UI: `src/shared/components/`

## Before opening a PR

- [ ] `yarn lint` passes
- [ ] `yarn test` passes
- [ ] `yarn tsc --noEmit` — **no new errors** (repo has ~31 pre-existing TS issues; do not add more)
- [ ] UI changes: loading, empty, error states verified
- [ ] Web UI: check breakpoints 1280, 1024, 900, 720 if layout touched
- [ ] New strings: added to `src/i18n/locales/en.ts` + `yarn sync-i18n`
- [ ] No hardcoded colors outside `tokens/design-tokens.json` / `AGENTS.md`
- [ ] No unrelated files in the diff

## Branch strategy

`main` is the primary branch. Document team MR conventions in `PROJECT_CONTEXT.md` when standardized.

## TypeScript notes

- Strict mode enabled (`tsconfig.json`)
- Path alias: `@/*` → `src/*`
- Known debt: `PressableStateCallbackType.focused`, `WebkitOverflowScrolling` in some StyleSheets — fix when touching those files, do not spread

## i18n workflow

1. Add keys to `src/i18n/locales/en.ts`
2. Run `yarn sync-i18n` to propagate to other locales
3. Use `useTranslation()` / `t('key')` in components

## Related docs

- [TESTING_AND_QA.md](./TESTING_AND_QA.md) — verification matrices
- [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) — coding standards
- [docs/README.md](./README.md) — documentation index
