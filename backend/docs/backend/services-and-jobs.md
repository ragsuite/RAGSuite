# Services & Background Jobs

**Last updated:** 2026-07-03

---

## Service layer map

| Module | Purpose |
|--------|---------|
| `admission.py` | Redis/DB job admission caps |
| `analytics_dashboard.py` | Analytics aggregation |
| `audit_service.py` | Audit event write/query |
| `chat_answer_links.py` | Verified source URLs in answers |
| `chat_execution_snapshot.py` | Runtime params on messages |
| `chroma_repair.py` | Chroma health/repair |
| `clickup_service.py` | ClickUp OAuth + sync |
| `compare_profiles.py` | Compare-model profiles |
| `concurrency_limits.py` | Crawl WAITING promotion, caps |
| `connectors/framework.py` | Shared connector orchestration |
| `connectors/google_drive.py` | Drive API client + sync |
| `connectors/notion.py` | Notion API client + sync |
| `crawl_diagnostics.py` | Crawl failure diagnostics |
| `crawl_ingest_helpers.py` | Crawl → Chroma helpers |
| `crawl_orchestration.py` | Crawl job lifecycle |
| `crawler.py` | Scrapy + Playwright crawler |
| `db_vector_consistency.py` | DB vs vector consistency |
| `document_content_urls.py` | Signed content URLs |
| `document_ingest_orchestration.py` | Upload ingest pipeline |
| `email_verification_service.py` | Email verify tokens/OTP |
| `embed_rate_limit.py` | Embedding API retries |
| `feedback_reason_catalog.py` | Moderation reasons |
| `gmail_service.py` | Gmail OAuth, fetch, index |
| `html_text_utils.py` | HTML → text |
| `indexing_job_types.py` | Job types sharing ingest caps |
| `ingest_runtime.py` | Thread-pool ingest execution |
| `job_queue.py` | **Postgres queue + worker handlers** |
| `job_settings_check.py` | Settings gates for jobs |
| `knowledge_base_status.py` | KB readiness gates |
| `llmconn.py` | LLM provider connections |
| `n8n_service.py` | n8n client |
| `notification_service.py` | In-app notifications |
| `observability.py` | Health/concurrency metrics |
| `onboarding_gate.py` | Onboarding completion checks |
| `project_deletion_service.py` | Async project teardown |
| `query_runtime.py` | Thread-pool RAG queries |
| `redis_client.py` | Shared Redis |
| `reindex_service.py` | Reindex jobs |
| `scheduler.py` | **APScheduler periodic tasks** |
| `search_persist.py` | Async search history/analytics |
| `search_run_context.py` | Search request resolution |
| `search_sources.py` | Citation cards from retrieval |
| `session_store.py` | Redis chat sessions |
| `source_display_policy.py` | Source visibility rules |
| `transactional_email.py` | SMTP |
| `two_factor_service.py` | TOTP + email 2FA |
| `rag/rag.py` | Core RAG pipeline |
| `rag/embedder_factory.py` | Multi-provider embeddings |
| `rag/embedding_resolver.py` | Resolve model per project |
| `rag/vector_db.py` | Chroma client |
| `rag/singleton.py` | Singleton pipeline + ingest locks |

---

## Background job types (`BackgroundJobType`)

| Type | Handler purpose |
|------|-----------------|
| `CRAWL` | Full crawl (legacy monolithic) |
| `CRAWL_FETCH` | Crawl fetch phase |
| `CRAWL_INGEST_BATCH` | Batch embed after crawl |
| `DOCUMENT_INGEST` | Upload / connector file indexing |
| `PURGE_CRAWL_SOURCE` | Delete crawl source data |
| `PURGE_UPLOADED_DOCUMENT` | Delete uploaded doc from index |
| `REINDEX` | Re-embed project |
| `SEND_VERIFICATION_EMAIL` | Async verification email |
| `WEBHOOK_DELIVERY` | Outbound webhook HTTP |
| `DATA_FOLDER_INGEST` | Auto-ingest data folder |
| `GMAIL_SYNC` | Gmail fetch/index |
| `CONNECTOR_SYNC` | Drive/Notion/etc. fetch → enqueue DOCUMENT_INGEST |
| `PURGE_CONNECTOR_INTEGRATION` | Teardown connector vectors |

**Ingest-cap sharing:** `DOCUMENT_INGEST`, `CRAWL_INGEST_BATCH`, `REINDEX`

---

## Connector sync flow

```text
POST /connectors/{type}/sync
  → enqueue_connector_sync (idempotency: connector_sync:{integration_id})
  → CONNECTOR_SYNC worker:
      platform API list/download → staging
      content-hash skip if unchanged
      enqueue DOCUMENT_INGEST per file
  → DOCUMENT_INGEST:
      ingest_document_to_all_targets_sync (search + chat collections)
```

Scheduler: `sync_connector_integrations` every 5 min checks cadence.

---

## Worker configuration

| Env | Role |
|-----|------|
| `ENABLE_DURABLE_JOBS` | Enable Postgres queue |
| `RUN_INLINE_WORKER` | Run worker in API process |
| `JOB_WORKER_THREADS` | Worker thread count |
| `JOB_WORKER_CRAWL_THREADS` | Crawl-dedicated threads |
| `JOB_WORKER_POLL_SECONDS` | Poll interval |
| `JOB_WORKER_MAX_PER_TICK` | Max jobs claimed per poll |
| `JOB_WORKER_STALE_MINUTES` | Reset stuck RUNNING jobs |

**Standalone:** `python -m app.worker`

---

## APScheduler jobs (`scheduler.py`)

| Job ID | Interval | Function |
|--------|----------|----------|
| `check_scheduled_crawls` | 1 hour | Promote sources by cadence |
| `check_data_folder` | 5 min | Auto-ingest data folder |
| `sync_gmail_integrations` | 5 min | Gmail sync by cadence |
| `sync_connector_integrations` | 5 min | Connector sync by cadence |
| `promote_waiting_crawls` | 60s (configurable) | WAITING → PENDING |
| `archive_old_background_jobs` | 1 week | Archive old jobs |

Redis lock: `ragsuite:sched:{key}` when Redis available.

---

## Job retry & fairness

- Fair round-robin claim by `user_id` (when enabled)
- Per-project ingest caps at enqueue + claim
- Org quotas via `Organization.max_*` at enqueue/claim
- Exponential backoff: `JOB_RETRY_BASE_DELAY_SECONDS`
- Manual retry: `POST /analytics/jobs/{job_id}/retry`

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/api_smoke_test.py` | Smoke-test OpenAPI |
| `scripts/concurrency_stress_check.py` | Concurrency validation |
| `scripts/check_embedding_storage.py` | Chroma embedding check |
| `scripts/backfill_api_key_hashes.py` | API key hash migration |
