[![Latest Stable Version](https://img.shields.io/badge/Stable-1.0.1-success)](https://github.com/ragsuite/RAGSuite)
[![RAGSuite GitHub](https://img.shields.io/badge/RAGSuite-informational?logo=github)](https://github.com/ragsuite/RAGSuite)
[![Website](https://img.shields.io/badge/Website-ragsuite.de-blue)](https://www.ragsuite.de)
[![npm CLI](https://img.shields.io/badge/npm-@ragsuite%2Fragsuite-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@ragsuite/ragsuite)
[![License](https://img.shields.io/badge/License-Apache--2.0-green)](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE)

# RAGSuite

[![RAGSuite — self-hosted RAG platform](https://raw.githubusercontent.com/ragsuite/RAGSuite/main/docs/images/ragsuite_readme.png)](https://www.ragsuite.de/)

Self-hosted RAG platform — FastAPI API + Expo admin UI.

**Website:** [www.ragsuite.de](https://www.ragsuite.de)  
**Source:** [github.com/ragsuite/RAGSuite](https://github.com/ragsuite/RAGSuite)

## Quick start (native — default)

```bash
cp .env.example .env    # once — set JWT, SMTP, and secrets
npm start               # API :9090 · web :9191
npm run stop            # stops processes; does not wipe the database
```

Prerequisites: Postgres (`ragsuite_v3` on **:5436**), Redis (**:6382**).  
Check: `bash scripts/doctor.sh`

## Ports

| Service | Port |
|---------|------|
| API | **9090** ([docs](http://localhost:9090/docs)) |
| Web (Expo) | **9191** |
| Postgres | **5436** |
| Redis | **6382** |

Optional Docker stack: `npm run start:docker` (web **:9191**). Do not run Docker and native at the same time.

## Install via CLI

```bash
npm install -g @ragsuite/ragsuite@latest
ragsuite init
ragsuite start
```

Full CLI guide: [`cli/README.md`](cli/README.md)

## Layout

```text
backend/    FastAPI
frontend/   Expo admin
cli/        Platform manager (npm)
scripts/    start / stop / doctor
```

## Commands

| Command | Effect |
|---------|--------|
| `npm start` / `npm run stop` | Native stack |
| `npm run start:docker` / `npm run down` | Optional Docker (volumes kept) |
| `bash scripts/doctor.sh` | Prerequisite check |

Never use `docker compose down -v` unless you intend to delete data.

## License

Copyright 2026 [NITSAN](https://nitsan.ai/)

Licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE).
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/NOTICE) for attribution and Community Edition scope.
