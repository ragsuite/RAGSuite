# Module migration status

Updated for **Phase 5** repository split. Loader: `load_extensions()` (CE `modules/` + `extensions/` + optional `$RAGSUITE_EE_ROOT`).

| id | edition | status | mount path | notes |
|----|---------|--------|------------|-------|
| `system_health` | community | **migrated** | CE `modules/system_health` | |
| `notifications` | community | **migrated** | CE `modules/notifications` | |
| `documents` | community | **migrated** | CE `modules/documents` | |
| `audit_basic` | community | **migrated** | CE `modules/audit_basic` | List/get; **30-day** filter |
| `crawl` | community | partial | legacy | |
| `chat` | community | partial | legacy | |
| `search` | community | partial | legacy | |
| `widgets` | community | partial | legacy | |
| `connectors` | community | partial | legacy | |
| `feedback` | community | partial | legacy | |
| `citations` | community | partial | legacy | |
| `auth_password` | community | partial | legacy | Still under crawl `/auth` |
| `auth_2fa_sessions` | community | partial | legacy | |
| `llm_providers` | community | partial | legacy | |
| `projects` | community | partial | legacy | Shared tenant |
| `sso` | enterprise | **migrated** | `RAGSUITE_EE/modules/sso` | Soft-shim at `app.routes.auth_sso` / `app.services.sso` |
| `organization` | enterprise | **migrated** | `RAGSUITE_EE/modules/organization` | Models + `org_invite` stay Shared in CE |
| `audit_full` | enterprise | **migrated** | `RAGSUITE_EE/modules/audit_full` | Export API |
| `compliance` | enterprise | **migrated** | `RAGSUITE_EE/modules/compliance` | Retention FE package |
| `compare_models` | enterprise | **migrated** | `RAGSUITE_EE/modules/compare_models` | Compare + profiles routers |
| `query_tracing` | enterprise | **migrated** | `RAGSUITE_EE/modules/query_tracing` | Snapshot + deep trace UI |
| `analytics` | enterprise | **migrated** | `RAGSUITE_EE/modules/analytics` | CE keeps overview |
| `mobile_beta` | enterprise | **migrated** | `RAGSUITE_EE/modules/mobile_beta` | Entitlement-only |
| `voice` | enterprise | **migrated** | `RAGSUITE_EE/modules/voice` | Browser STT/TTS widget slots; CE stubs render null |

**DX:** CE boots without EE. Sibling `RAGSUITE_EE` (or `RAGSUITE_EE_ROOT`) is auto-attached by `npm start`. See [DEV-WORKSPACE.md](../DEV-WORKSPACE.md) and [REPO-SPLIT.md](../REPO-SPLIT.md).
