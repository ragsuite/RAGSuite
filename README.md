[![Latest Stable Version](https://img.shields.io/badge/Stable-1.0.3-success)](https://github.com/ragsuite/RAGSuite)
[![RAGSuite GitHub](https://img.shields.io/badge/RAGSuite-informational?logo=github)](https://github.com/ragsuite/RAGSuite)
[![Website](https://img.shields.io/badge/Website-ragsuite.de-blue)](https://www.ragsuite.de)
[![Docs](https://img.shields.io/badge/Docs-docs.ragsuite.de-blue)](https://docs.ragsuite.de/)
[![npm CLI](https://img.shields.io/badge/npm-@ragsuite%2Fragsuite-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@ragsuite/ragsuite)
[![License](https://img.shields.io/badge/License-Apache--2.0-green)](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE)

# RAGSuite

[![RAGSuite — self-hosted RAG platform](https://raw.githubusercontent.com/ragsuite/RAGSuite/main/docs/images/ragsuite_readme.png)](https://www.ragsuite.de/)

Self-hosted RAG platform — FastAPI API + Expo admin UI. Apache 2.0.

**Website:** [www.ragsuite.de](https://www.ragsuite.de) · **Documentation:** [docs.ragsuite.de](https://docs.ragsuite.de/) · **Source:** [github.com/ragsuite/RAGSuite](https://github.com/ragsuite/RAGSuite)

## Quick start

```bash
npm install -g @ragsuite/ragsuite@latest
ragsuite init      # prompts for mode; default = native
ragsuite start
```

Web UI **http://localhost:9191** · API **http://localhost:9090** ([docs](http://localhost:9090/docs))

`ragsuite doctor` checks prerequisites before you start. `ragsuite stop` shuts the stack down and keeps your database.

Default install folder `~/ragsuite`; saved config `~/.ragsuite/config.json`.  
Full CLI guide: [`cli/README.md`](cli/README.md)

## Prerequisites

| | |
|---|---|
| Shared | Node **18+** (20/22 LTS recommended) · npm · Git 2.30+ · macOS, Linux, or Windows **WSL2 / Git Bash** |
| Native mode (default) | Python **3.14** · Yarn 1.22+ · Postgres **15+** on **:5436** (db `ragsuite_v3`) · Redis **7+** on **:6382** |
| Docker mode (`init --docker`) | Docker Desktop/Engine running · Compose v2 |

## Ports

| Service    | Port                                          |
| ---------- | --------------------------------------------- |
| API        | **9090** ([docs](http://localhost:9090/docs)) |
| Web (Expo) | **9191**                                      |
| Postgres   | **5436**                                      |
| Redis      | **6382**                                      |

## Build from source

If you would rather run the repo directly than use the CLI:

```bash
cp .env.example .env    # once — set JWT, SMTP, and secrets
npm start               # API :9090 · web :9191
npm run stop            # stops processes; does not wipe the database
```

This path assumes Postgres and Redis are already running on the ports above.  
Check with `bash scripts/doctor.sh`.

Optional Docker stack: `npm run start:docker` (web **:9191**). Do not run Docker and native at the same time.  
Never use `docker compose down -v` unless you intend to delete data.

## Layout

```text
backend/    FastAPI
frontend/   Expo admin
cli/        Platform manager (npm)
scripts/    start / stop / doctor
```

## Commands

| Command                                 | Effect                         |
| --------------------------------------- | ------------------------------ |
| `npm start` / `npm run stop`            | Native stack                   |
| `npm run start:docker` / `npm run down` | Optional Docker (volumes kept) |
| `bash scripts/doctor.sh`                | Prerequisite check             |

Never use `docker compose down -v` unless you intend to delete data.

Day-to-day start remains a **single** command:

```bash
docker compose up -d --build
```

Only if `chromadb` is already stuck unhealthy and you want to avoid rebuilding frontend:

```bash
docker compose up -d --no-deps --force-recreate chromadb
docker compose up -d
```

## Community & Enterprise

The Community Edition in this repository is Apache 2.0 and needs **no licence key**.  
Enterprise features (SSO/SAML/OIDC, RBAC, full audit and compliance exports, Compare Models, deep query tracing, advanced analytics) are commercially licensed and activate **offline** — no licence server. See [`cli/README.md`](cli/README.md#enterprise) and [ragsuite.de/pricing](https://www.ragsuite.de/pricing/).

## Contributing & security

[`CONTRIBUTING.md`](CONTRIBUTING.md) (CLA) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`SECURITY.md`](SECURITY.md)

## License

Copyright 2026 [NITSAN](https://nitsan.ai/)

Licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE).  
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/NOTICE) for attribution and Community Edition scope.
