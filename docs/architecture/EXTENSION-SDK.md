# Extension SDK (index)

How to build and load RAGSuite **Modules** as **Extensions**. This page is the packaging entry point; detailed contracts live in the ADRs and guides below.

## Core docs

| Doc | Purpose |
|-----|---------|
| [MODULE-SYSTEM.md](./MODULE-SYSTEM.md) | Module interface, manifest, independence rules, how to add a CE module |
| [EXTENSION-FRAMEWORK.md](./EXTENSION-FRAMEWORK.md) | Edition-agnostic scan → load → register |
| [ADR-002-modules.md](./ADR-002-modules.md) | Module independence decision |
| [ADR-003-extensions.md](./ADR-003-extensions.md) | Extension contract |
| [BUNDLES.md](./BUNDLES.md) | Shipping EE modules as compiled bundles |
| [FEATURE-MATRIX.md](./FEATURE-MATRIX.md) | Which capabilities are CE vs EE |

## Quick rules

1. One module = one capability; **no module→module imports**.
2. Declare `manifest` (`id`, `edition`, `status`, `permissions`, optional `migrations` metadata).
3. Platform runs Alembic; module `migrations:` refs are metadata only ([MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md)).
4. Enterprise modules live in private `RAGSUITE_EE` and load via `RAGSUITE_EE_ROOT` or an installed bundle + offline license entitlements.

## Contributor entry

See root [CONTRIBUTING.md](../../CONTRIBUTING.md) and [DEV-WORKSPACE.md](./DEV-WORKSPACE.md).
