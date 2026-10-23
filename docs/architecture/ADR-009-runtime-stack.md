# ADR-009 — Runtime stack (ES + MinIO + API/Worker + Nginx /api)

## Status

Accepted (2026-10-20)

## Context

High traffic bottlenecks a single FastAPI process plus Postgres that held app metadata, pgvector embeddings, and `background_jobs`. Disk staging was the shared contract between API and worker. Nginx served the Expo UI, widgets, and embed CSP only — it did not load-balance `/api`.

RAGFlow’s *idea* (split API vs ingest, ES for search, MinIO for blobs, Nginx in front of many APIs) is the right shape. RAGSuite keeps Python, Postgres, Redis, Expo, and the CE/EE module split.

## Decision

CE, EE, and hosted Docker use one spine:

- FastAPI API × N + Worker × N
- Postgres: metadata + jobs (`background_jobs`, `SKIP LOCKED`)
- Redis: cache, scheduler/worker locks (queue later if jobs get hot)
- Elasticsearch: chunks + vectors (primary retrieve)
- MinIO: uploaded/connector file bytes
- Nginx: `/` `/embed` `/widget` as today, plus `upstream api` for `/api` on `:9191` and the public API listener on `:9090`

Do **not** adopt Go, MySQL, Kvrocks, NATS, Elastic Cloud, or MinIO Cloud. EE stays SSO/RBAC/audit — not a different queue or database.

Retrieve ranking stays RAGSuite’s: parallel semantic + keyword, **RRF default**, existing threshold / Top K / optional bge-reranker. Do not copy RAGFlow fusion weights or kNN-filtered-by-BM25.

Parser → Chunker → Extractor → Indexer UI and retrieve knobs are later work on this same stack.

## Host ports (this project)

| Service | Port |
|---------|------|
| API (Nginx → API × N) | **9090** |
| Web UI (Nginx) | **9191** |
| Postgres | **5436** |
| Redis | **6382** |
| Elasticsearch | **9210** |
| MinIO S3 / console | **9010** / **9011** |

Hosted Linux: `vm.max_map_count ≥ 262144`. Never `docker compose down -v` on live tenants.

## Consequences

- Native `npm start` still binds uvicorn `:9090` + Expo `:9191`; compose starts Postgres, Redis, ES, MinIO on the same named volumes. `docker compose up -d --build` and `npm run start:docker` are the same stack (npm adds EE attach and `--scale`).
- Docker publishes 9090/9191 on the frontend Nginx container only; `backend` stays internal (`expose 8000`) and is scaled with `API_REPLICAS` / `WORKER_REPLICAS`.
- Object store image is `pgsty/silo` (S3 API, `/data` volume). Official `minio/minio` is no longer publicly pullable (2026); existing `minio_data` stays valid.
- pgvector tables remain as a migrate source; they are not the chat/search path.
- Widget `${scriptOrigin}/api/v1` on `:9191` now hits the API upstream instead of SPA HTML.

## Scale follow-on

- Nginx re-resolves `backend` via Docker DNS (`127.0.0.11`, 10s) so API × N replicas are used without a reload. Open-source nginx uses a variable `proxy_pass` (round-robin); workers stay off the edge.
- Redis lists `ragsuite:jobs:{role}` are a **wake** path only. `background_jobs` in Postgres remains the record; claim is CAS by id, with `SKIP LOCKED` poll if Redis is down.
- Worker roles: `crawl` | `index` | `sync` | `misc`. Compose `worker` handles index/sync/misc; `worker-crawl` handles crawl. Native `WORKER_ROLES=all`.
- ES collection indexes use `number_of_replicas: 0` on single-node. Raise heap with `ES_JAVA_OPTS` (not a second ES node). pgvector tables stay as migrate source.
