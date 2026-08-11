# RAGSuite architecture (CE / EE)

**Status:** Phases 0–15 executed — Platform + Modules + Extensions + License/Ops + migration/test/release checklist.  
**Authority:** Masterplan Phases 0–15. Retired: any `RAGSUITE_PRO` / overlay plan.

## One-page summary

```text
Platform
  owns: auth, db, router, events, permissions protocol, storage, settings,
        CLI lifecycle, API shell, configuration, extension/plugin loader

Modules
  one capability · one interface · independent (no module→module imports)
  CE modules live in the public Community repo
  EE modules live in private RAGSUITE_EE and ship as compiled Bundles

Extensions
  what Platform loads — CE and EE modules look the same to the loader
  scan: modules/ + extensions/ → load → register
  Platform does not know “Community / Enterprise / Marketplace” brands

License Server (separate product)
  customers, licenses, seats, machines, activations, download auth
  internal Ops console (manual sales fulfillment)
  Email pack: offline.key + EE tar → customer pastes install paths (ACTIVATION.md)
  Sync catalog from private EE GitHub Releases (not tags alone) — CICD.md
  NOT RAG business logic

Upgrade
  signed offline license key · app verifies without phone-home
```

| Path | Role |
|------|------|
| `/Users/arun/RAGSUITE` | Community Edition = Platform + Community modules + CLI + Shared |
| `/Users/arun/RAGSUITE_EE` | Enterprise modules only (private) |
| `/Users/arun/RAGSUITE_License` | License Server + Ops console (Phase 8 / 12) |

**DX:** `cd /Users/arun/RAGSUITE && npm start` → API `:9090`, web `:9191` (native + Docker).  
CE must boot when `RAGSUITE_EE` is absent.

Edition comparison: [ragsuite.de/pricing/#comparison](https://www.ragsuite.de/pricing/#comparison).

## ADR map

| ADR | Topic |
|-----|--------|
| [ADR-001-platform.md](./ADR-001-platform.md) | Platform spine |
| [ADR-002-modules.md](./ADR-002-modules.md) | Module interface & independence |
| [ADR-003-extensions.md](./ADR-003-extensions.md) | Extension load/register contract |
| [ADR-004-versioning.md](./ADR-004-versioning.md) | Platform / module / bundle / CLI versions |
| [ADR-005-licensing.md](./ADR-005-licensing.md) | Offline keys, entitlements, grace |
| [ADR-006-bundles.md](./ADR-006-bundles.md) | Compiled EE delivery |
| [ADR-007-repository-strategy.md](./ADR-007-repository-strategy.md) | CE / EE / License trees & attach |
| [ADR-008-cli.md](./ADR-008-cli.md) | Published CLI surface |

## Companion docs

| Doc | Purpose |
|-----|---------|
| [FEATURE-MATRIX.md](./FEATURE-MATRIX.md) | Pricing row → CE / EE / Platform / by-agreement (+ partial footnotes) |
| [API-GUIDE.md](./API-GUIDE.md) | API docs index |
| [EXTENSION-SDK.md](./EXTENSION-SDK.md) | Extension/Module SDK index |
| [REPO-SPLIT.md](./REPO-SPLIT.md) | Phase 5 CE vs EE tree, attach via `RAGSUITE_EE_ROOT` |
| [DEV-WORKSPACE.md](./DEV-WORKSPACE.md) | Phase 6 one-workspace DX |
| [BUNDLES.md](./BUNDLES.md) | Phase 7 Enterprise bundle build / install / verify |
| [ACTIVATION.md](./ACTIVATION.md) | Phase 10 offline/online activate, update, expiry, rollback |
| [MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md) | Phase 13 upgrade path, Alembic policy, compat matrix |
| [TEST-MATRIX.md](./TEST-MATRIX.md) | Phase 14 CE/EE matrix — Pass / Waived-with-owner |
| [RELEASE-NOTES.md](./RELEASE-NOTES.md) | CE release notes (0.1.x cut) |
| [RELEASE-CHECKLIST-RESULT.md](./RELEASE-CHECKLIST-RESULT.md) | Phase 15 coordinated checklist result |
| [CICD.md](./CICD.md) | Phase 11 CE/EE/License CI/CD |
| [MODULE-SYSTEM.md](./MODULE-SYSTEM.md) | Phase 3 Module interface |
| [EXTENSION-FRAMEWORK.md](./EXTENSION-FRAMEWORK.md) | Phase 4 Extension loader |
| [RELEASE-STRATEGY.md](./RELEASE-STRATEGY.md) | Public CE vs EE bundles vs License Server |
| [audit/](./audit/) | Inventory + GAPS |
| [../../CONTRIBUTING.md](../../CONTRIBUTING.md) | Community contributor guide |

## Keywords (use these)

**Platform · Module · Extension · Bundle · License Server**

Do not describe the architecture as an “overlay” or `RAGSUITE_PRO`.
