# Platform layout (Phase 2)

**Status:** Landed under `backend/app/platform/` (Python package).  
**Authority:** [ADR-001-platform.md](./ADR-001-platform.md).  
Top-level `platform/` in [TARGET-FOLDER-STRUCTURE.md](./TARGET-FOLDER-STRUCTURE.md) remains a **future** repo-root shape; Phase 2 does not create it.

## Tree

```text
backend/app/platform/
  __init__.py              # lazy create_app export
  settings.py              # env / typed settings
  db.py                    # engine, sessions, create_tables
  auth.py                  # JWT/session/deps (auth protocol spine)
  limiter.py
  security_utils.py
  paths.py                 # backend_root, data_tmp_dir
  defaults.py
  events.py                # in-process pub/sub stub
  permissions.py           # capability-check facade
  storage.py               # storage_root + path helpers
  extension_loader.py      # load_extensions(app) no-op → Phase 4
  cli_hooks.py             # CLI lifecycle hook registry (empty)
  app_factory.py           # create_app() + lifespan + middleware
  legacy_mount.py          # mount_legacy_feature_routers(app)

backend/app/{auth,db,settings,limiter,paths,security_utils,defaults}.py
  → compatibility shims re-exporting app.platform.*

backend/app/main.py
  → app = create_app()   # uvicorn app.main:app unchanged
```

## Ownership

| Concern | Location |
|---------|----------|
| Authentication protocol | `platform/auth.py` |
| Database | `platform/db.py` |
| Settings / config | `platform/settings.py` |
| API shell / app factory | `platform/app_factory.py` |
| Events | `platform/events.py` |
| Permissions protocol | `platform/permissions.py` |
| Storage conventions | `platform/storage.py`, `paths.py` |
| Extension loader (placeholder) | `platform/extension_loader.py` |
| Module SDK + loader (Phase 3) | `platform/module_*.py`, repo `modules/` |
| Extension loader (Phase 4) | `platform/extension_loader.py` — scans modules/ + extensions/ + optional EE roots |
| CLI lifecycle hooks (placeholder) | `platform/cli_hooks.py` |
| Feature HTTP routers | `app/routes/*` (legacy mount) + migrated `modules/*/backend` |
| Feature services | `app/services/*` |

Business features (crawl, chat, org, audit, …) **depend on** Platform via imports/`app.*` shims — Platform must not import feature routers except through `legacy_mount` during boot.

## Boot sequence

```text
create_app()
  → FastAPI + lifespan + CORS + middleware
  → load_extensions(app)                # Phase 4: modules/ + extensions/ + optional EE roots
  → mount_legacy_feature_routers(app)   # unmigrated API paths
```

## Shim policy

Existing code may keep `from app.auth`, `from ..db`, `from .settings`.  
New Platform-internal code should prefer `from app.platform…`.

Shims re-export underscore helpers (e.g. `_get_redis_client`) needed by SSO/state.

## Explicit non-goals (this phase)

- No `RAGSUITE_EE` extract  
- No Module manifests / scanner  
- No license/entitlement gates  
- No public API path renames  
- No frontend Platform package yet  

## DX

```bash
cd /Users/arun/RAGSUITE && npm start
# API :9090 · Expo :9191
```

CE boots with `RAGSUITE_EE` absent.
