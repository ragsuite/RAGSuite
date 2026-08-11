# ADR-001 — Platform

## Status

Accepted (Phase 0 freeze)

## Context

RAGSuite today is a monolith that mixes Community capabilities and Enterprise-class features. Before any code moves, we freeze what the **Platform** owns versus what becomes a **Module**.

## Decision

The Platform is the infrastructure spine of the Community Edition. It owns cross-cutting runtime and contracts. It does **not** own product capabilities (crawl, chat, analytics, SSO, etc.).

### Platform owns

| Concern | Responsibility |
|---------|----------------|
| Authentication protocol | Session/password plumbing, token issuance hooks, auth middleware contracts — not SSO product UI/flows (those are modules) |
| Database | Connection, migrations runner, shared schema primitives |
| Router / API shell | HTTP app bootstrap, `/api/v1` mount points, health |
| Events | In-process (and later bus) event pub/sub contracts |
| Permissions protocol | Capability checks against declared permissions — not org RBAC product logic |
| Storage | Object/file storage adapters and path conventions |
| Settings | Global configuration store and typed settings API |
| CLI lifecycle | Process orchestration hooks used by the published CLI |
| Configuration | Env, ports, deploy defaults (9090 / 9191 / 9091 / 5436 / 6382 / 8004) |
| Extension / plugin loader | Scan, load, register Extensions (edition-agnostic) |

### Platform does not own

- Product features classified in [FEATURE-MATRIX.md](./FEATURE-MATRIX.md) as CE or EE modules
- Enterprise license issuance or customer billing (License Server)
- Edition branding logic that gates security (`getProductEdition()` style badges are cosmetic until entitlements exist)

### Runtime invariant

Platform starts → discovers Extensions → registers routes, nav, permissions, migrations, seeders, settings → serves API and UI shell.

CE alone must boot with zero Enterprise Extensions present.

## Consequences

- Later phases extract product code into modules; Platform shrinks toward the spine above.
- Module system (ADR-002) and Extension framework (ADR-003) depend on this boundary.
- Security gates use entitlements (ADR-005), never a UI edition badge.
