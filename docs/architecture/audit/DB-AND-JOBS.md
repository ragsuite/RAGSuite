# DB and jobs audit

Row format: `path | proposed module id | edition class | risk | coupling notes`

## Alembic

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `backend/alembic/` + `alembic.ini` | — | Platform | high | Runner for all editions |
| `alembic/versions/*` (~90) | mixed | Shared | high | CE+EE schema history in one train |

**Phase 13 policy:** one shared Alembic train owned by Platform; module `migrations:` refs are metadata only (no per-module runners yet). In-place `alembic upgrade head` on native/Docker start — never wipe volumes for upgrade. Full operator guide: [MIGRATION-GUIDE.md](../MIGRATION-GUIDE.md).

### Migrations touching org / SSO / audit / analytics / jobs

| path (versions) | proposed module id | edition class | risk | coupling notes |
|-----------------|-------------------|---------------|------|----------------|
| `*sprint4_job_archive_org_quotas*` | `organization` / Platform | EE / Platform | med | `organizations`, `job_archive`, quotas |
| `*org_memberships_and_acl*` | `organization` | EE | high | `organization_members`, `project_members`; **no Teams** |
| `*google_sso_tables*` | `sso` | EE | high | `organization_sso_configs`, `user_idp_identities` |
| `*invite_lifecycle_to_org_members*` | `organization` | EE | med | Invite columns |
| `*add_audit_events_table*` | `audit_*` | CE/EE | high | `audit_events` |
| `*recreate_analytics_days*` / merge analytics | `analytics` | EE | med | `analytics_days` (+ `org_id`) |
| `*add_background_and_reindex_jobs*` | — | Platform | high | `background_jobs`, `reindex_jobs` |

### Keyword scan — absent in DB

| Concern | Status |
|---------|--------|
| Teams entity | **Missing** (org members + project ACL only) |
| SAML tables | **Missing** (Google OIDC only) |
| Compliance / legal hold tables | **Missing** |
| Dedicated compare migration | **None**; `model_config_profiles.compare_enabled` in models |
| SCIM / SIEM | **Missing** (by-agreement roadmap) |

## Tables (logical) → class

| table / area | proposed module id | edition class | risk | coupling notes |
|--------------|-------------------|---------------|------|----------------|
| `organizations`, `organization_members`, `project_members` | `organization` | EE | high | RBAC-ish ACL |
| `organization_sso_configs`, `user_idp_identities` | `sso` | EE | high | Google OIDC |
| `audit_events` | `audit_basic` / `audit_full` | CE/EE | high | No export API yet |
| `analytics_days` | `analytics` | EE | med | |
| `model_config_profiles` (+ compare flags) | `compare_models` | EE | med | |
| `background_jobs`, `job_archive`, `reindex_jobs` | — | Platform | high | |
| `crawl_jobs`, `*_sync_jobs` | `crawl` / `connectors` | CE | med | |
| Core RAG/document/project tables | `crawl` / `documents` / `projects` / `chat` / `search` | CE / Shared | med | Monolith `models.py` |

## Worker / scheduler / queues

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `backend/app/worker.py` | — | Platform | high | `python -m app.worker` |
| `backend/app/services/job_queue.py` | — | Platform | high | Enqueue/claim; crawl, ingest, connectors, email, purges |
| `backend/app/services/scheduler.py` | — | Platform | high | Live APScheduler from `main` lifespan |
| `backend/app/scheduler.py` | — | Platform | low | Legacy duplicate |
| `backend/app/services/indexing_job_types.py` | — | Platform | low | |
| `backend/app/services/concurrency_limits.py` | Platform / `organization` | Platform / EE | med | Org-aware caps |
| `backend/app/services/admission.py` | — | Platform | med | Redis admission |
| `backend/app/services/query_runtime.py` | Shared + `compare_models` | Shared / EE | med | Thread pool includes compare |
| `backend/configs/supervisor/ragsuite.conf` | — | Platform | low | gunicorn + worker |

## Jobs ↔ modules

| Job family | proposed module id | edition class |
|------------|-------------------|---------------|
| CRAWL*, DOCUMENT_INGEST | `crawl` / `documents` | CE |
| REINDEX | `search` / Platform | CE / Platform |
| GMAIL / CONNECTOR_SYNC | `connectors` | CE |
| Webhooks / email / purges | Platform / CE | Platform |
| Analytics export jobs (if any) | `analytics` | EE |

## Coupling risks

1. Single `models.py` blocks clean CE boot without EE tables unless migrations are split or EE tables become optional.
2. Org quotas and concurrency limits couple Platform jobs to EE `organization`.
3. Compare and analytics share Platform query runtime.
