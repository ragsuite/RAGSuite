# Module migration status

Updated for **Phase 5** repository split. Loader: `load_extensions()` (CE `modules/` + `extensions/` + optional `$RAGSUITE_EE_ROOT`).

| id | edition | status | mount path | notes |
|----|---------|--------|------------|-------|
| `ai_assistant` | community | **migrated** | CE `modules/ai_assistant` | Admin Assistant — in-app operator assistant (no embed); own LLM settings |
| `system_health` | community | **migrated** | CE `modules/system_health` | |
| `notifications` | community | **migrated** | CE `modules/notifications` | |
| `documents` | community | **migrated** | CE `modules/documents` | |
| `audit_basic` | community | **migrated** | CE `modules/audit_basic` | List/get; **15-day** window + daily purge |
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
| `voice` | community | **migrated** | CE `modules/voice` + `frontend/src/features/voice` | Browser STT/TTS widget slots (moved from EE) |
| `ai_voice_pilot` | community | **migrated** | CE `modules/ai_voice_pilot` + `frontend/src/features/ai-voice-pilot` | Dashboard voice↔voice Pilot + chatbot tab (moved from EE) |
| `mcp` | community | **migrated** | CE `modules/mcp` | Outbound MCP Connector |
| `model_configuration` | community | **migrated** | CE `modules/model_configuration` + `frontend/src/modules/model_configuration` | Project / provider model config |
| `data_compliance` | community | **migrated** | CE `modules/data_compliance` | CE compliance surfaces; EE `compliance` for retention product |
| `trust_center` | community | **migrated** | CE `modules/trust_center` | Trust Center |
| `sso` | enterprise | **migrated** | `RAGSuite-EE/modules/sso` | Google + Microsoft Entra OIDC; soft-shim at `app.routes.auth_sso` / `app.services.sso` |
| `organization` | enterprise | **migrated** | `RAGSuite-EE/modules/organization` | Models + `org_invite` stay Shared in CE |
| `audit_full` | enterprise | **migrated** | `RAGSuite-EE/modules/audit_full` | Unlimited history + export API |
| `compliance` | enterprise | **migrated** | `RAGSuite-EE/modules/compliance` | Retention FE package |
| `compare_models` | enterprise | **migrated** | `RAGSuite-EE/modules/compare_models` | Compare + profiles routers |
| `query_tracing` | enterprise | **migrated** | `RAGSuite-EE/modules/query_tracing` | Snapshot + deep trace UI |
| `analytics` | enterprise | **migrated** | `RAGSuite-EE/modules/analytics` | CE keeps overview |
| `mobile_beta` | enterprise | **migrated** | `RAGSuite-EE/modules/mobile_beta` | Entitlement-only |
| `white_label` | enterprise | **migrated** | `RAGSuite-EE/modules/white_label` | Partner branding / footer entitlement |

**DX:** CE boots without EE. Sibling `RAGSuite-EE` / `RAGSUITE_EE` (or `RAGSUITE_EE_ROOT`) is auto-attached by `npm start`. See [DEV-WORKSPACE.md](../DEV-WORKSPACE.md) and [REPO-SPLIT.md](../REPO-SPLIT.md).
