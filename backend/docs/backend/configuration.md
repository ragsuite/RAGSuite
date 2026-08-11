# Backend Configuration Reference

**Source of truth:** `app/settings.py` + `.env.example` (repo root)  
**Load order:** `.env` with `override=True`  
**Last updated:** 2026-07-20

---

## Required (startup fails without these)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET_KEY` | JWT signing; placeholder rejected in production |
| `CUSTOM_LLM_INTERNAL_API_KEY` | Internal LLM integration; startup guard |

---

## Core application (`settings.py`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_NAME` | `RAGSuite` | Application name |
| `APP_VERSION` | `1.0.0` | Version string |
| `DEBUG` | `false` | Verbose errors; affects CORS guard |
| `SQL_ECHO` | `false` | Log all SQL statements |
| `ENABLE_SCHEDULER` | `true` | APScheduler periodic jobs |
| `ENABLE_RAG_WARMUP` | `true` | Warm RAG on startup |
| `CORS_ORIGINS` | `*` | CORS allowlist (string/JSON/comma) |
| `CORS_ORIGIN_REGEX` | `""` | Additional CORS regex |
| `PUBLIC_API_BASE_URL` | `""` | Public API URL for clients |
| `FRONTEND_BASE_URL` | `http://localhost:9091` | OAuth/SSO redirects & email links (Expo web) |

Infra connection defaults (`REDIS_*`, `CHROMA_*`, `OLLAMA_BASE_URL`) are also Settings fields — see Redis / ChromaDB / LLM sections below. When `CORS_ORIGINS` is empty and not debug, CORS falls back to origins derived from `FRONTEND_BASE_URL` + `PUBLIC_API_BASE_URL`.

---

## JWT & sessions

| Variable | Default | Purpose |
|----------|---------|---------|
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `JWT_EXPIRE_MINUTES` | `60` | Access token TTL |
| `JWT_INACTIVITY_TIMEOUT_MINUTES` | `1440` | Inactivity logout |
| `OAUTH_STATE_SECRET` | `""` | OAuth CSRF state signing |
| `OAUTH_STATE_TTL_SECONDS` | `600` | OAuth state TTL |
| `CHAT_SESSION_TTL_SECONDS` | `7200` | Redis chat session TTL |

---

## Registration & email / organization

| Variable | Default | Purpose |
|----------|---------|---------|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_USER` | `""` | SMTP username |
| `SMTP_PASSWORD` | `""` | SMTP password |
| `SMTP_USE_TLS` | `true` | SMTP TLS |
| `EMAIL_FROM` | `""` | From address |
| `EMAIL_VERIFICATION_TTL_MINUTES` | `1440` | Verify link TTL |
| `EMAIL_VERIFICATION_OTP_LENGTH` | `6` | OTP length |
| `EMAIL_VERIFICATION_OTP_TTL_MINUTES` | `15` | OTP TTL |
| `EMAIL_VERIFICATION_OTP_MAX_ATTEMPTS` | `5` | OTP max attempts |
| `EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS` | `60` | Resend cooldown |
| `EMAIL_VERIFICATION_RESEND_MAX_PER_DAY` | `5` | Daily resend cap |

**Org model:** Public self-registration is disabled by code policy. Bootstrap first admin via `python -m app.cli bootstrap-org-admin`; then provision users via org invites or SSO. Org-level `registration_enabled` in DB is an additional internal gate.

---

## SSO (Google OIDC organization login)

| Variable | Default | Purpose |
|----------|---------|---------|
| `SSO_ENABLED` | `false` | Global SSO kill switch |
| `SSO_CALLBACK_BASE_URL` | `""` | **Public URL of this backend** (e.g. `https://api.customer.com` or `http://localhost:9090` in dev). Callback: `{base}/api/v1/auth/sso/callback` |
| `SSO_REQUIRE_REDIS` | `false` | Fail closed if Redis unavailable (set `true` in Docker/multi-worker) |
| `PUBLIC_API_BASE_URL` | `""` | Fallback for callback URL if `SSO_CALLBACK_BASE_URL` empty |
| `FRONTEND_BASE_URL` | `http://localhost:9091` | Post-SSO redirect target (`/login/callback`) |

Per-org Google `client_id` / `client_secret` are stored via `PUT /api/v1/org/sso` (encrypted).  
See [organization-and-sso.md](./organization-and-sso.md).

---

## Crawler

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_CONCURRENT_REQUESTS` | `32` | Crawler concurrency |
| `DOWNLOAD_DELAY` | `0.5` | Delay between requests (seconds) |
| `USER_AGENT` | `RAGSuite-Crawler/1.0` | Crawler user agent |
| `CRAWL_CONTENT_LENGTH_LIMIT` | `10000000` | Max chars per page |
| `EXTERNAL_CRAWLER_URL` | `""` | External crawler service |
| `CRAWL_SSL_VERIFY` | `true` | HTTPS cert verification |
| `CRAWL_HEADLESS_MAX_PARALLEL` | `2` | Playwright parallel pages |
| `CRAWL_HEADLESS_NAVIGATION_TIMEOUT_MS` | `45000` | Nav timeout |
| `CRAWL_HEADLESS_AUTO_MIN_TEXT_CHARS` | `120` | AUTO headless threshold |
| `CRAWL_HEADLESS_AUTO_SETTLE_MS` | `500` | Headless settle wait |

---

## Gmail OAuth

| Variable | Default |
|----------|---------|
| `GOOGLE_CLIENT_ID` | `""` |
| `GOOGLE_CLIENT_SECRET` | `""` |
| `GOOGLE_REDIRECT_URI` | `http://localhost:9090/api/v1/gmail/auth/callback` |
| `GMAIL_CREDENTIALS_ENCRYPTION_KEY` | `""` |

---

## ClickUp OAuth

| Variable | Default |
|----------|---------|
| `CLICKUP_CLIENT_ID` | `""` |
| `CLICKUP_CLIENT_SECRET` | `""` |
| `CLICKUP_REDIRECT_URI` | `http://localhost:9090/api/v1/clickup/auth/callback` |

---

## Embeddings & RAG

| Variable | Default | Purpose |
|----------|---------|---------|
| `EMBEDDING_PREFERRED_SOURCE` | `search` | `search` or `chat` for resolver |
| `COMPARE_MODEL_CONFIG_SOURCE` | `search` | Compare-models profile source |
| `DEFAULT_EMBEDDING_MODEL` | `jina/jina-embeddings-v2-base-de` | Default embedding model |
| `DOCUMENT_INGEST_TIMEOUT_SECONDS` | `7200` | Upload ingest wall-clock limit |
| `ENABLE_ASYNC_DOCUMENT_INGEST` | `true` | Queue document indexing |
| `DOCUMENT_STAGING_DIR` | `data/staging` | Staging path |
| `ENABLE_ASYNC_INGEST` | `true` | Offload embed from event loop |
| `INGEST_POOL_WORKERS` | `6` | Ingest thread pool |
| `QUERY_POOL_WORKERS` | `12` | RAG query thread pool |
| `CRAWL_INGEST_BATCH_SIZE` | `0` | Crawl ingest batching (0=all) |
| `CHROMA_INGEST_BATCH_SIZE` | `0` | Chroma add batch size |
| `INGEST_BATCH_PAUSE_MS` | `1000` | Pause between batches |
| `EMBED_RATE_LIMIT_MAX_RETRIES` | `6` | Embed HTTP retries |
| `EMBED_RATE_LIMIT_BASE_DELAY_MS` | `2000` | Retry base delay |
| `EMBED_RATE_LIMIT_RETRY_CAP_SECONDS` | `300` | Max retry wait |
| `CRAWL_INGEST_RATE_LIMIT_MAX_ATTEMPTS` | `0` | BG job deferrals on 429 |
| `EMBED_RATE_LIMIT_JOB_RETRY_CAP_SECONDS` | `600` | Job-level retry cap |

### RAG source display (read from env in `source_display_config.py`)

| Variable | Typical | Purpose |
|----------|---------|---------|
| `DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT` | `60` | Min chunk similarity to show source |
| `CHAT_SOURCES_MIN_CONFIDENCE_PCT` | `60` | Hide sources if retrieval confidence low |
| `CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP` | `1` | Require chunk/answer word overlap |
| `CHAT_SOURCES_MIN_OVERLAP_HITS` | `1` | Min overlap tokens |
| `RAG_MAX_CONTEXTS` | `20` | Max chunks to LLM (0=use top_k only) |
| `RAG_LOW_CONFIDENCE_THRESHOLD` | `25` | Low-confidence threshold |

---

## Background jobs & workers

| Variable | Default | Purpose |
|----------|---------|---------|
| `ENABLE_DURABLE_JOBS` | `true` | Postgres job queue |
| `RUN_INLINE_WORKER` | `true` | Worker in API process |
| `ENABLE_REDIS_ADMISSION` | `false` | Redis atomic job caps |
| `JOB_WORKER_POLL_SECONDS` | `1.0` | Worker poll interval |
| `JOB_WORKER_MAX_PER_TICK` | `5` | Jobs claimed per tick |
| `JOB_WORKER_THREADS` | `4` | Worker threads |
| `JOB_WORKER_CRAWL_THREADS` | `2` | Dedicated crawl threads |
| `JOB_WORKER_STALE_MINUTES` | `30` | Stale RUNNING reset |
| `BACKGROUND_JOB_RETENTION_DAYS` | `30` | Archive retention |
| `JOB_RETRY_BASE_DELAY_SECONDS` | `30` | Exponential retry base |
| `CRAWL_JOB_STALE_MINUTES` | `360` | Stale crawl timeout |
| `REINDEX_BATCH_SIZE` | `100` | Reindex batch size |
| `CRAWL_INGEST_BATCH_SIZE_JOBS` | `25` | Docs per CRAWL_INGEST_BATCH |

---

## Concurrency caps

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_CONCURRENT_CRAWLS_PER_USER` | `0` | Per-user crawl cap (0=unlimited) |
| `MAX_CONCURRENT_REINDEXES_PER_USER` | `0` | Per-user reindex cap |
| `MAX_CONCURRENT_CRAWLS_PER_PROJECT` | `2` | Per-project crawl cap |
| `MAX_CONCURRENT_REINDEXES_PER_PROJECT` | `2` | Per-project reindex cap |
| `MAX_CONCURRENT_INGEST_PER_PROJECT` | `2` | Running ingest jobs/project |
| `MAX_QUEUED_INGEST_PER_PROJECT` | `50` | Pending+running ingest cap |
| `WAITING_CRAWL_PROMOTE_INTERVAL_SEC` | `60` | WAITING sweeper interval |
| `WAITING_CRAWL_ALERT_THRESHOLD` | `10` | Log alert for WAITING count |

---

## ChromaDB

| Variable | Default | Where read | Purpose |
|----------|---------|------------|---------|
| `CHROMA_MODE` | `local` | settings / `infra_env` | `local` or `http` |
| `CHROMA_HOST` | `127.0.0.1` (compose: `chromadb`) | settings | HTTP host |
| `CHROMA_PORT` | `8004` (compose: `8000`) | settings | HTTP port |
| `CHROMA_SSL` | `false` | settings | TLS |
| `CHROMA_PERSIST_PATH` | `""` (falls back to local path) | settings + vector_db | Local SQLite path |
| `ENABLE_CHROMA_STARTUP_REPAIR` | `true` | settings | Repair on startup |
| `PER_PROJECT_DEFAULT_COLLECTION` | `false` | settings | Per-project collections |
| `ENABLE_CHROMA_PER_COLLECTION_LOCK` | `false` | settings | Parallel writes (http only) |

**Production:** `CHROMA_MODE=http` + `WEB_CONCURRENCY>1` requires Redis.

---

## Redis

| Variable | Default | Purpose |
|----------|---------|---------|
| `REDIS_URL` | null | Full URL override |
| `REDIS_HOST` | `""` (empty = disabled unless URL; compose sets `redis`) | Host |
| `REDIS_PORT` | `6382` (compose internal: `6379`) | Port |

Used for: sessions, rate limits, OAuth state, admission counters, scheduler locks.

---

## Multi-worker

| Variable | Default | Purpose |
|----------|---------|---------|
| `WEB_CONCURRENCY` | `1` | Uvicorn/Gunicorn workers |

Guards: `WEB_CONCURRENCY>1` + `CHROMA_MODE=local` → startup failure.

---

## LLM providers (runtime)

| Variable | Default | Purpose |
|----------|---------|---------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API |

Provider API keys are stored per-user in `LLMConfig` / settings tables, not only in env.

---

## Planned (future features)

| Variable | Purpose | Doc |
|----------|---------|-----|
| SAML / SCIM settings | Enterprise IdP | [planned/sso.md](../planned/sso.md) |

---

## Production checklist

- [ ] Change `JWT_SECRET_KEY`, `CUSTOM_LLM_INTERNAL_API_KEY`
- [ ] Set `DEBUG=false`, restrict `CORS_ORIGINS`
- [ ] Confirm invite-only mode remains enforced (no public self-registration path)
- [ ] Redis for sessions in production
- [ ] `CHROMA_MODE=http` for multi-worker
- [ ] Separate `ragsuite-worker` process (`RUN_INLINE_WORKER=false` on API)
- [ ] SMTP configured for email verification / 2FA
