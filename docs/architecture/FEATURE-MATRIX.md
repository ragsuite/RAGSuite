# FEATURE-MATRIX

Source: [ragsuite.de/en/pricing/#comparison](https://ragsuite.de/en/pricing/#comparison)  
Classification: **CE module** | **EE module** | **Platform** | **by-agreement**

Module IDs align with [ADR-002-modules.md](./ADR-002-modules.md).

## Platform (edition-agnostic spine)

| Pricing / product row | Classification | Notes |
|----------------------|----------------|-------|
| Price / seats (commercial terms) | — | Commercial; not a code module |
| Users · Projects limits | Platform + license | CE unlimited users; EE seats on license claims — **app hard-cap incomplete** (roadmap; [GAPS](./audit/GAPS.md)) |
| REST API shell · API keys · webhooks plumbing | Platform | Product routes live in modules |
| Docker / deploy spine · ports · config | Platform | |
| Extension / plugin loader | Platform | ADR-003 |
| Settings / configuration store | Platform | |
| Auth protocol · DB · events · storage · permissions protocol | Platform | Product auth UX / SSO = modules |
| CLI lifecycle hooks | Platform + CLI | ADR-008 |

## Community modules (CE)

| Pricing row | Classification | Module ID(s) | Path (post Phase 5) |
|-------------|----------------|--------------|---------------------|
| Full pipeline — crawl | CE module | `crawl` | CE legacy (`backend/app/routes/crawl*`) |
| Full pipeline — upload | CE module | `documents` | `modules/documents` |
| Full pipeline — chat | CE module | `chat` | CE legacy |
| Full pipeline — search | CE module | `search` | CE legacy |
| Full pipeline — widgets | CE module | `widgets` | CE legacy |
| Connectors & MCP — Gmail, n8n (Beta), MCP, Marketplace | CE module | `connectors` + `mcp` | Sources connectors = inbound CE; outbound MCP Connector = `modules/mcp` |
| Microsoft Teams Sources connector | CE module | `connectors` (Teams) | CE crawl / Sources — **not** org hierarchy Teams |
| All LLM providers, incl. local Ollama | CE module | `llm_providers` | CE legacy |
| Citations on every answer | CE module | `citations` | CE legacy |
| Feedback collection | CE module | `feedback` | CE legacy |
| 2FA & sessions | CE module | `auth_2fa_sessions` | CE legacy |
| System health | CE module | `system_health` | `modules/system_health` |
| Audit logs — Basic · last 15 days (older events purged daily) | CE module | `audit_basic` | `modules/audit_basic` |
| Password auth (implied Community) | CE module | `auth_password` | CE legacy |
| Notifications (in-app) | CE module | `notifications` | `modules/notifications` |
| Voice input + AI VoiceOver | CE module | `voice` | `modules/voice` + `frontend/src/features/voice` — browser STT/TTS on chatbot + search widgets |
| AI Voice Pilot | CE module | `ai_voice_pilot` | `modules/ai_voice_pilot` + `frontend/src/features/ai-voice-pilot` — dashboard voice↔voice RAG + ElevenLabs TTS |
| Admin Assistant (in-app operator helper) | CE module | `ai_assistant` | `modules/ai_assistant` + `frontend/src/modules/ai_assistant` — never the embeddable chatbot |
| Model configuration | CE module | `model_configuration` | `modules/model_configuration` + `frontend/src/modules/model_configuration` |
| Projects (tenant / workspace) | CE module | `projects` | CE Shared + module surfaces — project ACL extends via EE `organization` |
| Trust Center | CE module | `trust_center` | `modules/trust_center` |
| Data compliance (CE surfaces) | CE module | `data_compliance` | `modules/data_compliance` — EE `compliance` adds retention / legal-hold product paths |
| Self-hosting Docker-native | Platform + CE packaging | — | Not an EE gate |
| Standard support — Community | Process | — | Not code |

## Enterprise modules (EE)

| Pricing row | Classification | Module ID(s) | Path (post Phase 5) | Accuracy |
|-------------|----------------|--------------|---------------------|----------|
| SSO / SAML / OIDC | EE module | `sso` | `RAGSuite-EE/modules/sso` (sibling `RAGSUITE_EE`) | **Partial** — Google OIDC + Microsoft Entra ID shipped; SAML / generic OIDC roadmap ([GAPS](./audit/GAPS.md)) |
| RBAC · organisation → teams → users | EE module | `organization` | `RAGSuite-EE/modules/organization` (models Shared in CE) | **Shipped** — orgs, Team Members, project ACL (distinct from **Microsoft Teams** Sources connector above) |
| Audit logs — Full + exports | EE module | `audit_full` | `RAGSuite-EE/modules/audit_full` | **Shipped** — unlimited audit history in list + CSV/JSON export; no Community purge while `audit_full` is installed |
| Compliance exports · retention / legal hold | EE module | `compliance` | `RAGSuite-EE/modules/compliance` | **Partial** — **per-project** data retention (Settings › Data Retention; CE keeps data without a limit and shows a locked preview); legal hold roadmap |
| Compare Models | EE module | `compare_models` | `RAGSuite-EE/modules/compare_models` | **Shipped** — CE locked teaser/gating incomplete ([GAPS](./audit/GAPS.md)) |
| Deep query tracing + CSV/JSON exports | EE module | `query_tracing` | `RAGSuite-EE/modules/query_tracing` | **Partial** — tracing UI; export product roadmap |
| Advanced analytics — cohorts, trends, cost | EE module | `analytics` | `RAGSuite-EE/modules/analytics` (CE keeps overview) | **Shipped** (advanced paths in EE) |
| Mobile app (Beta) | EE module | `mobile_beta` | `RAGSuite-EE/modules/mobile_beta` | **Partial** — surfaces exist; license entitlement gate roadmap |
| White-label · partner branding | EE module | `white_label` | `RAGSuite-EE/modules/white_label` | **Partial** — entitlement stub (logo / org name / footer); by-agreement commercial |
| Support — Email · DE/EN | Process | — | — | Sales/ops process |

Compare Models may show a **locked teaser** on CE; full UI/API requires EE + entitlements. See [REPO-SPLIT.md](./REPO-SPLIT.md).

Voice (`voice`) and AI Voice Pilot (`ai_voice_pilot`) are Community modules — no license or entitlement required. Enterprise is a full-product license: a valid/grace offline key unlocks the **current** EE catalog on the Platform (`KNOWN_ENTERPRISE_MODULE_IDS` — catalog is source of truth). Adding or removing a catalog module does not require a new key; Ops emails a new EE bundle and customers run `ragsuite update --bundle`. Re-issue a key only for expiry renew, seats, revoke, or signing-key rotation.

**Commercial:** Enterprise is **sales-led** (“Talk to us” / `sales@ragsuite.de`) — aligned with pricing. Public self-serve license portal is deferred; fulfillment via License Ops Console.

## By agreement (enterprise services / roadmap)

| Pricing row | Classification | Notes |
|-------------|----------------|-------|
| White-label · custom widget domain | by-agreement | Service / config; EE `white_label` entitlement unlocks partner branding paths |
| SLA · dedicated CSM · guided onboarding | by-agreement | Service |
| Air-gapped support | by-agreement | Process + offline license/bundle (ADR-005/006) |
| Usage billing meters · SCIM · SIEM streaming (roadmap) | by-agreement | Future; may become EE modules later |

## Summary map

```text
Platform     → spine + loader
CE modules   → practitioner pipeline, connectors, voice, Admin Assistant, trust
EE modules   → governance, SSO, compliance, analytics, mobile, white_label
by-agreement → services & roadmap (not required for CE boot)
```
