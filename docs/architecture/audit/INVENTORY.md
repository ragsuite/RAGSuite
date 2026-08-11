# Phase 1 audit — inventory index

**Status:** Phase 1 complete (docs only). No product code moved.  
**Authority:** [FEATURE-MATRIX.md](../FEATURE-MATRIX.md), [ADR-002-modules.md](../ADR-002-modules.md), Phases 0–15.  
**Repo audited:** `/Users/arun/RAGSUITE`

## Audit documents

| Doc | Purpose |
|-----|---------|
| [INVENTORY.md](./INVENTORY.md) | This index + top-level map |
| [FRONTEND-MODULES.md](./FRONTEND-MODULES.md) | Features, routes, nav, actions, providers |
| [BACKEND-MODULES.md](./BACKEND-MODULES.md) | Routes, services, models, spine |
| [API-ROUTE-MAP.md](./API-ROUTE-MAP.md) | Every `main.py` `include_router` |
| [DB-AND-JOBS.md](./DB-AND-JOBS.md) | Alembic, tables, worker/scheduler |
| [CLI-SCRIPTS-DOCKER.md](./CLI-SCRIPTS-DOCKER.md) | CLI, scripts, Docker, CI, tests, env |
| [CLASSIFICATION-MATRIX.md](./CLASSIFICATION-MATRIX.md) | Pricing → module → paths |
| [MODULE-CANDIDATES.md](./MODULE-CANDIDATES.md) | Module list for Phase 3 |
| [GAPS.md](./GAPS.md) | Missing / greenfield EE |

## Top-level CE tree

| Path | Role today | Class hint |
|------|------------|------------|
| `backend/` | FastAPI monolith | Platform + CE + EE mixed |
| `frontend/` | Expo Router app | Platform shell + CE + EE mixed |
| `cli/` | `@ragsuite/ragsuite` | Platform lifecycle + CE packaging |
| `scripts/` | Native/Docker start/stop/doctor | Platform |
| `docker/` + `docker-compose*.yml` | Images / compose | Platform (+ EE env wiring) |
| `docs/architecture/` | ADRs + this audit | Shared docs |
| `platform/`, `modules/`, `extensions/` | **Absent** | Target (Phase 2+) |

## Classification legend

| Class | Meaning |
|-------|---------|
| **Platform** | Spine: auth protocol, db, settings, jobs, API shell, future loader |
| **CE module** | Community product capability |
| **EE module** | Enterprise capability (still in CE tree until Phase 5) |
| **Shared** | Contracts/tenant primitives used by multiple modules |

Row format used in detailed docs: `path | proposed module id | edition class | risk | coupling notes`

## Reality check

- EE features (org/SSO/audit/analytics/compare/tracing) **already ship inside** this public tree.
- `getProductEdition()` / `EXPO_PUBLIC_PRODUCT_EDITION` is **cosmetic** — not a security gate.
- Empty remnant: `backend/app/overlay/` (prior naming; not active strategy).
- DX unchanged: `npm start` → API `:9090`, Expo `:9191`.
