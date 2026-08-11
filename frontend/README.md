# RAGSuite Frontend (Server workspace)

Expo admin client (iOS, Android, web) for **RAGSuite** — part of **`/Users/arun/RAGSuite_Server`**.

Backend lives beside this package at [`../backend`](../backend). Prefer the **full stack** from the repo root:

```bash
cd /Users/arun/RAGSuite_Server
cp .env.example .env   # once
npm start              # API :9090 · Web UI :9191
```

## Isolation

Edit only files under this repo `frontend/`.  
**Do not** modify sibling legacy clones (`RAGSuite_backend`, `mobile-ragsuite`).

## Frontend-only / native dev

```bash
cd frontend
yarn install
yarn env:local          # API_URL → http://localhost:9090
yarn start              # Expo Metro — press w / i / a
# or
yarn web
```

| Command | Effect |
| ------- | ------ |
| `yarn env:local` | `envs/local.json` → `env.json` (`http://localhost:9090`) |
| `yarn env:containerized` | Same API origin for Docker web builds |
| `yarn env:staging` / `env:production` | Staging / production origins |

`env.json` is gitignored. Paths live in `src/network/apiUrl.ts`.

## Ports (this workspace)

| Service | Port |
|---------|------|
| API | **9090** |
| Web (native Expo / Docker nginx) | **9191** |

## Project structure

```text
src/
├── app/           # Expo Router routes
├── features/      # Domain modules
├── shared/        # Reusable UI
├── network/       # Axios + *.actions.ts
├── i18n/
├── theme/
└── providers/
```

## Documentation

| Audience | Start here |
| -------- | ---------- |
| **Developers** | [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) |
| **AI assistants** | [AI_PROJECT_MEMORY.md](./AI_PROJECT_MEMORY.md) → [docs/README.md](./docs/README.md) |
| **Backend API** | [docs/BACKEND_API_CONTRACT.md](./docs/BACKEND_API_CONTRACT.md) · `../backend` |
| **Brand / UI** | [AGENTS.md](./AGENTS.md) |
| **Workspace** | [../AGENTS.md](../AGENTS.md) |

## Before merging

- `yarn lint` and `yarn test` pass
- `yarn tsc --noEmit` — no **new** errors on touched files
- UI: loading, empty, and error states
- Brand tokens only (`AGENTS.md` / `tokens/`)

## Stack

Expo SDK ~55 · React 19 · React Native 0.83 · Expo Router · TypeScript · Axios · Jest  
Auth: JWT Bearer (SecureStore / localStorage)

## License

Copyright 2026 NITSAN

Licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE).
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/NOTICE) for attribution and Community Edition scope.
