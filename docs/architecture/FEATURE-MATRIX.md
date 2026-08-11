# FEATURE-MATRIX

Source: [ragsuite.de/pricing/#comparison](https://www.ragsuite.de/pricing/#comparison)  
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
| Connectors & MCP — Gmail, n8n (Beta), MCP, Marketplace | CE module | `connectors` | CE legacy |
| All LLM providers, incl. local Ollama | CE module | `llm_providers` | CE legacy |
| Citations on every answer | CE module | `citations` | CE legacy |
| Feedback collection | CE module | `feedback` | CE legacy |
| 2FA & sessions | CE module | `auth_2fa_sessions` | CE legacy |
| System health | CE module | `system_health` | `modules/system_health` |
| Audit logs — Basic · 30 days | CE module | `audit_basic` | `modules/audit_basic` |
| Password auth (implied Community) | CE module | `auth_password` | CE legacy |
| Notifications (in-app) | CE module | `notifications` | `modules/notifications` |
| Self-hosting Docker-native | Platform + CE packaging | — | Not an EE gate |
| Standard support — Community | Process | — | Not code |

## Enterprise modules (EE)

| Pricing row | Classification | Module ID(s) | Path (post Phase 5) | Accuracy |
|-------------|----------------|--------------|---------------------|----------|
| SSO / SAML / OIDC | EE module | `sso` | `RAGSUITE_EE/modules/sso` | **Partial** — Google OIDC shipped; SAML / generic OIDC roadmap ([GAPS](./audit/GAPS.md)) |
| RBAC · organisation → teams → users | EE module | `organization` | `RAGSUITE_EE/modules/organization` (models Shared in CE) | **Partial** — members + project ACL; Teams entity roadmap |
| Audit logs — Full + exports | EE module | `audit_full` | `RAGSUITE_EE/modules/audit_full` | **Partial** — full logs; CSV/JSON export product roadmap |
| Compliance exports · retention / legal hold | EE module | `compliance` | `RAGSUITE_EE/modules/compliance` | **Partial** — retention-oriented; legal hold roadmap |
| Compare Models | EE module | `compare_models` | `RAGSUITE_EE/modules/compare_models` | **Shipped** — CE locked teaser/gating incomplete ([GAPS](./audit/GAPS.md)) |
| Deep query tracing + CSV/JSON exports | EE module | `query_tracing` | `RAGSUITE_EE/modules/query_tracing` | **Partial** — tracing UI; export product roadmap |
| Advanced analytics — cohorts, trends, cost | EE module | `analytics` | `RAGSUITE_EE/modules/analytics` (CE keeps overview) | **Shipped** (advanced paths in EE) |
| Mobile app (Beta) | EE module | `mobile_beta` | `RAGSUITE_EE/modules/mobile_beta` | **Partial** — surfaces exist; license entitlement gate roadmap |
| Support — Email · DE/EN | Process | — | — | Sales/ops process |

Compare Models may show a **locked teaser** on CE; full UI/API requires EE + entitlements. See [REPO-SPLIT.md](./REPO-SPLIT.md).

**Commercial:** Enterprise is **sales-led** (“Talk to us” / `sales@ragsuite.de`) — aligned with pricing. Public self-serve license portal is deferred; fulfillment via License Ops Console.

## By agreement (enterprise services / roadmap)

| Pricing row | Classification | Notes |
|-------------|----------------|-------|
| White-label · custom widget domain | by-agreement | Service / config; not a public CE module |
| SLA · dedicated CSM · guided onboarding | by-agreement | Service |
| Air-gapped support | by-agreement | Process + offline license/bundle (ADR-005/006) |
| Usage billing meters · SCIM · SIEM streaming (roadmap) | by-agreement | Future; may become EE modules later |

## Summary map

```text
Platform     → spine + loader
CE modules   → practitioner pipeline & connectors
EE modules   → governance, compliance, analytics, mobile entitlement
by-agreement → services & roadmap (not required for CE boot)
```
