# ADR-002 — Modules

## Status

Accepted (Phase 0 freeze)

## Context

Product capabilities must be separable for Community (public source) and Enterprise (private source, bundled delivery) without a web of cross-imports.

## Decision

Every product-facing capability is a **Module** with one interface and one identity.

### Module interface (required surface)

| Surface | Role |
|---------|------|
| Frontend | Screens / components registered with Platform UI |
| Backend | Services / domain logic |
| Routes | HTTP routes mounted via Platform router |
| Navigation | Nav items / deep links |
| Permissions | Declared permission keys (checked via Platform protocol) |
| Migration | Schema changes owned by the module |
| Seeder | Optional seed data |
| API | Public/stable API contracts exported for Platform |
| Settings | Module settings schema and defaults |

A Module may omit a surface that does not apply (e.g. no UI), but the contract must still declare presence/absence explicitly in its manifest (defined in Phase 3+).

### Independence rule

**No module may directly import another module.**

Cross-module needs use:

- Platform contracts and shared types (Shared)
- Platform events
- Documented API boundaries owned by Platform

Violations are treated as architecture bugs during Phase 2+ refactors.

### Example module IDs

| ID | Edition (see FEATURE-MATRIX) | Notes |
|----|------------------------------|-------|
| `crawl` | CE | Crawl / source ingestion |
| `documents` | CE | Upload & document library |
| `chat` | CE | AI Assistant |
| `search` | CE | AI Search |
| `widgets` | CE | Embeddable widgets |
| `connectors` | CE | Connectors, MCP, n8n, marketplace |
| `llm_providers` | CE | Provider registry incl. Ollama |
| `citations` | CE | Citations on answers |
| `feedback` | CE | Feedback collection |
| `auth_password` | CE | Password auth UX (Platform owns protocol) |
| `auth_2fa_sessions` | CE | 2FA & sessions |
| `system_health` | CE | System health surfaces |
| `audit_basic` | CE | Basic audit · 30 days |
| `sso` | EE | SSO / SAML / OIDC |
| `organization` | EE | Org → teams → users · RBAC |
| `audit_full` | EE | Full audit + exports |
| `compliance` | EE | Compliance exports · retention / legal hold |
| `compare_models` | EE | Compare Models |
| `query_tracing` | EE | Deep query tracing + CSV/JSON exports |
| `analytics` | EE | Advanced analytics — cohorts, trends, cost |
| `mobile_beta` | EE | Mobile app (Beta) entitlement |

IDs may be refined in Phase 1 audit without changing the independence rule.

### Community vs Enterprise modules

- **Community modules** ship as source in the public CE repo under `modules/`.
- **Enterprise modules** live only in `RAGSUITE_EE` and are delivered to customers as **Bundles** (ADR-006).

To Platform, both are **Extensions** (ADR-003).

## Consequences

- Refactors must break module→module imports before or during extraction.
- Shared code that is not a product feature belongs in Platform or Shared contracts — not a “god” module.
