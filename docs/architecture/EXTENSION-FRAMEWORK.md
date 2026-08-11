# Extension Framework (Phase 4)

**Authority:** [ADR-003-extensions.md](./ADR-003-extensions.md)  
**Builds on:** [MODULE-SYSTEM.md](./MODULE-SYSTEM.md) (Module interface)

## Mental model

An **Extension** is what Platform loads. A Module (CE or EE or future marketplace) is packaged and discovered as an Extension.

Platform does **not** branch on Community / Enterprise / Marketplace brands.  
“Feature available” means **extension registered** (and later entitlement-allowed) — not “Python import succeeded.”

## Boot

```text
create_app()
  → load_extensions(app)              # unified scan + Module register
  → mount_legacy_feature_routers(app) # unmigrated monolith routes
```

Implementation: [`backend/app/platform/extension_loader.py`](../../backend/app/platform/extension_loader.py)  
Shared register: [`backend/app/platform/module_loader.py`](../../backend/app/platform/module_loader.py) → `register_extension_from_dir`

## Scan order (first-wins on duplicate id)

| # | Root | When |
|---|------|------|
| 1 | `<repo>/modules/` | Always if directory exists |
| 2 | `<repo>/extensions/` | Always if directory exists |
| 3 | `<repo>/extensions/installed/ee/<ACTIVE>/modules` | `ACTIVE` marker present (Phase 7 bundle) |
| 4 | `$RAGSUITE_EE_ROOT/modules/` | Env set **and** directory exists |
| 5 | `$RAGSUITE_EE_ROOT/extensions/` | Env set **and** directory exists |

Unset / missing `RAGSUITE_EE_ROOT` and no installed bundle → soft-skip; **CE continues**.

## Failure policy

| Case | Behavior |
|------|----------|
| Missing optional root | Log + continue |
| Invalid manifest | Skip package + log |
| `status` not `migrated` | Inventory only (partial/legacy) |
| Missing `backend/register.py` / `register.pyc` on migrated | Skip + warn |
| `register()` raises | Skip + exception log; CE boot continues |
| Duplicate id | First registered wins; later skipped |
| Entitlement denied | Skip (hook always allows until Phase 8/10) |

## Contribution types (via Module interface)

When `status: migrated`, `backend/register.py` receives `ModuleContext` and may:

- `register_router` — HTTP API
- `declare_permissions` — capability keys
- `declare_navigation` — nav metadata
- `declare_migrations` — schema ownership refs
- `declare_settings` — settings panel ids
- `publish` / `subscribe` — Platform events

## DX

```bash
# CE alone
unset RAGSUITE_EE_ROOT
cd /Users/arun/RAGSUITE && npm start

# CE + EE attach (empty modules/ is safe)
export RAGSUITE_EE_ROOT=/Users/arun/RAGSUITE_EE
cd /Users/arun/RAGSUITE && npm start
# API :9090 · Expo :9191
```

## Explicit non-goals (this phase)

- Moving EE source out of CE (Phase 5)
- License / entitlement enforcement (Phase 8/10)
- Git submodules
- `if enterprise:` in the loader
