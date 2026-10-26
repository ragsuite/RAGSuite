<div align="center">
  <a href="https://www.ragsuite.de/">
    <img src="frontend/assets/logo/ragsuite-symbol.svg" width="96" alt="RAGSuite" />
  </a>
  <h1>RAGSuite</h1>
</div>

<div align="center">

Self-hosted RAG platform — FastAPI API + Expo admin UI. Apache 2.0.

[![Latest Stable Version](https://img.shields.io/badge/Stable-1.0.8-success)](https://github.com/ragsuite/RAGSuite)
[![RAGSuite GitHub](https://img.shields.io/badge/RAGSuite-informational?logo=github)](https://github.com/ragsuite/RAGSuite)
[![Website](https://img.shields.io/badge/Website-ragsuite.de-blue)](https://www.ragsuite.de/)
[![Docs](https://img.shields.io/badge/Docs-docs.ragsuite.de-blue)](https://docs.ragsuite.de/)
[![npm CLI](https://img.shields.io/badge/npm-@ragsuite%2Fragsuite-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@ragsuite/ragsuite)
[![License](https://img.shields.io/badge/License-Apache--2.0-green)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.14-3776AB?logo=python&logoColor=white)](#prerequisites)
[![Node](https://img.shields.io/badge/Node-18%2B-339933?logo=nodedotjs&logoColor=white)](#prerequisites)
[![Docker](https://img.shields.io/badge/Docker-Compose_v2-2496ED?logo=docker&logoColor=white)](#build-from-source)
[![CI](https://img.shields.io/github/actions/workflow/status/ragsuite/RAGSuite/ci.yml?label=CI)](https://github.com/ragsuite/RAGSuite/actions/workflows/ci.yml)

[![Website](https://img.shields.io/badge/Website-ragsuite.de-0B3D2E)](https://www.ragsuite.de/)
[![Documentation](https://img.shields.io/badge/Documentation-docs.ragsuite.de-1E3A30)](https://docs.ragsuite.de/)
[![Pricing](https://img.shields.io/badge/Pricing-ragsuite.de%2Fen%2Fpricing-B6802E)](https://ragsuite.de/en/pricing/)
[![npm CLI](https://img.shields.io/badge/npm_CLI-@ragsuite%2Fragsuite-CB3837)](https://www.npmjs.com/package/@ragsuite/ragsuite)
[![Source](https://img.shields.io/badge/Source-GitHub-181717?logo=github)](https://github.com/ragsuite/RAGSuite)

[Website](https://www.ragsuite.de/) · [Docs](https://docs.ragsuite.de/) · [Quick start](#quick-start) · [Prerequisites](#prerequisites) · [Ports](#ports) · [Build from source](#build-from-source) · [Community & Enterprise](#community--enterprise) · [Contributing & security](#contributing--security) · [License](#license)

[![RAGSuite — self-hosted RAG platform](https://raw.githubusercontent.com/ragsuite/RAGSuite/main/docs/images/ragsuite_readme.png)](https://www.ragsuite.de/)

</div>

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
| Native mode (default) | Python **3.14** · Yarn 1.22+ · Postgres **15+** with the **pgvector** extension on **:5436** (db `ragsuite_v3`) · Redis **7+** on **:6382** · Elasticsearch **:9210** · MinIO **:9010** (compose starts these if Docker is available) |
| Docker mode (`init --docker`) | Docker Desktop/Engine running · Compose v2 |

## Ports

| Service        | Port                                          |
| -------------- | --------------------------------------------- |
| API            | **9090** ([docs](http://localhost:9090/docs)) |
| Web (Expo / Nginx) | **9191**                                  |
| Postgres       | **5436**                                      |
| Redis          | **6382**                                      |
| Elasticsearch  | **9210**                                      |
| MinIO          | **9010** (console **9011**)                   |

## Build from source

If you would rather run the repo directly than use the CLI:

```bash
cp .env.example .env    # once — set JWT, SMTP, and secrets
npm start               # API :9090 · web :9191
npm run stop            # stops processes; does not wipe the database
```

`npm start` starts host API + Expo and, if needed, the compose **data** services (Postgres, Redis, Elasticsearch, MinIO) on the named volumes — it does not wipe data.  
Check with `bash scripts/doctor.sh`.

Docker is the same stack and the same volumes:

```bash
docker compose up -d --build          # API ×2 + Worker ×2, Nginx :9090/:9191
npm run start:docker                  # same compose + EE attach
npm run down                          # docker compose down  (volumes kept)
# API_REPLICAS=4 WORKER_REPLICAS=4 docker compose up -d
```

Do not run the Docker app containers and native API/Expo at the same time.  
Never use `docker compose down -v` unless you intend to delete data.

## Layout

```text
backend/     FastAPI Platform + Shared
frontend/    Expo admin
modules/     Community modules (Extension packages)
extensions/  Optional EE bundle attach root
cli/         Platform manager (npm @ragsuite/ragsuite)
scripts/     start / stop / doctor
docs/architecture/  ADRs, feature matrix, release notes
```

Agent / contributor entry points: [AGENTS.md](./AGENTS.md) · [backend/AGENTS.md](./backend/AGENTS.md) · [frontend/AGENTS.md](./frontend/AGENTS.md)

## Commands

| Command                                 | Effect                         |
| --------------------------------------- | ------------------------------ |
| `npm start` / `npm run stop`            | Native stack                   |
| `npm run start:docker` / `npm run down` | Optional Docker (volumes kept) |
| `bash scripts/doctor.sh`                | Prerequisite check             |

Never use `docker compose down -v` unless you intend to delete data.

Day-to-day Docker start remains a **single** command:

```bash
docker compose up -d --build
```

Chunks and vectors live in Elasticsearch; file bytes live in MinIO; Postgres keeps
metadata and jobs. On first start the one-shot `vector-migrate` service copies
legacy Chroma → pgvector (if needed), then pgvector → ES and leftover blobs → MinIO.
Later starts report "already complete" and skip it. Named volumes survive
`up --build`, `npm run down`, and `npm run stop`.

## Community & Enterprise

The Community Edition in this repository is Apache 2.0 and needs **no licence key**.  
Enterprise features (SSO/SAML/OIDC, RBAC, full audit and compliance exports, Compare Models, deep query tracing, advanced analytics) are commercially licensed and activate **offline** — no licence server. See [`cli/README.md`](cli/README.md#enterprise) and [ragsuite.de/en/pricing](https://ragsuite.de/en/pricing/).

## Contributing & security

[`CONTRIBUTING.md`](CONTRIBUTING.md) (CLA) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`SECURITY.md`](SECURITY.md)

## License

Copyright 2026 [NITSAN GmbH](https://nitsan.ai/)

Licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE).  
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/NOTICE) for attribution and Community Edition scope.
