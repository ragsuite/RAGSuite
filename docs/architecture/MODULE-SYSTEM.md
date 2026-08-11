# Module System (Phase 3)

**Authority:** [ADR-002-modules.md](./ADR-002-modules.md) · [MODULE-CANDIDATES.md](./audit/MODULE-CANDIDATES.md)  
**Status inventory:** [audit/MODULE-MIGRATION-STATUS.md](./audit/MODULE-MIGRATION-STATUS.md)

## What a Module is

A Module is one product capability with **one interface**. Platform loads Modules; Modules must not import each other.

### Interface surfaces (declare in `manifest.yaml`)

| Surface | Meaning |
|---------|---------|
| `id` + `version` | Stable identity |
| `edition` | `community` \| `enterprise` \| `platform` (metadata only — loader is edition-agnostic) |
| `status` | `migrated` (register runs) · `partial` · `legacy` |
| `surfaces.*` | frontend, backend, routes, navigation, permissions, migration, seeder, api, settings |
| `permissions` | Declared capability keys |
| `navigation` | Nav contribution metadata |
| `migrations` | Owned schema refs |

### Python register contract

```python
# modules/<id>/backend/register.py
def register(ctx: ModuleContext) -> None:
    ctx.register_router(router, name="<id>")
    ctx.declare_permissions([...])
    ctx.declare_navigation([...])
```

`ModuleContext` is defined in [`backend/app/platform/module_context.py`](../../backend/app/platform/module_context.py).

## Layout

```text
RAGSUITE/modules/<id>/
  manifest.yaml
  backend/
    register.py      # required when status: migrated
    routes.py        # optional
    service.py       # optional
  # frontend contributions live under frontend/src/modules/<id>/
```

Import namespace: `ragsuite_modules.<id>...` (bootstrapped by Platform to point at `modules/`).

## Boot order

```text
create_app()
  → load_extensions(app)              # Phase 4 unified scan (includes modules/)
  → mount_legacy_feature_routers()    # everything not yet migrated
```

See [EXTENSION-FRAMEWORK.md](./EXTENSION-FRAMEWORK.md) for scan roots and failure policy.

## Independence rule

**Forbidden:** `modules/A` importing `modules/B` or `ragsuite_modules.B`.

**Allowed:** Platform (`app.platform.*`, shims), Shared monolith helpers (`app.models`, `app.services.rag`), and **Platform-facing shims** such as `app.services.notification_service` (which delegates into the notifications module so producers are not module→module).

Enforced by [`backend/tests/test_module_independence.py`](../../backend/tests/test_module_independence.py).

## How to add a Community module

1. Create `modules/<id>/manifest.yaml` with `status: migrated` and surface flags.
2. Implement `modules/<id>/backend/register.py` (+ routes/services as needed).
3. Remove the corresponding `include_router` from [`legacy_mount.py`](../../backend/app/platform/legacy_mount.py).
4. Add `frontend/src/modules/<id>/index.ts` exporting screens + `register*Module()`.
5. Call it from [`loadCommunityModules.ts`](../../frontend/src/platform/modules/loadCommunityModules.ts).
6. Keep Expo file routes; import screens **only** via the module public entry.
7. Update [MODULE-MIGRATION-STATUS.md](./audit/MODULE-MIGRATION-STATUS.md).
8. Run independence test + `from app.main import app`.

## Frontend registry

- Types/registry: `frontend/src/platform/modules/`
- Migrated entries: `frontend/src/modules/{system_health,notifications,documents}/`
- `loadCommunityModules()` runs from `AppProviders`

## Explicit non-goals (this phase)

- Scanning `extensions/` or `RAGSUITE_EE_ROOT` (Phase 4)
- Moving EE source out of CE (Phase 5)
- License / entitlement gates
