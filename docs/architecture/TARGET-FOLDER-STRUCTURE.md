# TARGET-FOLDER-STRUCTURE

Phase 0 **proposal**. **Phase 2 landed** the Platform spine at
[`backend/app/platform/`](../../backend/app/platform/) (see [PLATFORM-LAYOUT.md](./PLATFORM-LAYOUT.md)).
Repo-root `platform/` below remains a **future** shape; do not duplicate today.
`modules/` / `extensions/` still Phase 3–4.

## Community Edition (`/Users/arun/RAGSUITE`)

```text
RAGSUITE/
  backend/app/platform/     # Phase 2 — Platform spine (ADR-001) [LANDED]
  platform/                 # Future repo-root mirror (not created yet)
    auth/
    db/
    router/
    events/
    permissions/
    storage/
    settings/
    config/
    extension_loader/
    cli_hooks/
  modules/                  # Community modules as Extensions (ADR-002/003)
    crawl/
    documents/
    chat/
    search/
    widgets/
    connectors/
    llm_providers/
    citations/
    feedback/
    auth_password/
    auth_2fa_sessions/
    system_health/
    audit_basic/
    …/
  extensions/               # Installed/attached Extensions (bundles, local plugins)
    .gitkeep
  shared/                   # Shared contracts/types (not product modules)
  backend/                  # May host platform + module BE until fully split
  frontend/                 # May host platform + module FE until fully split
  cli/                      # Published CLI (ADR-008)
  docs/
    architecture/           # This folder
  package.json              # npm start → :9090 + :9191
```

Each module directory (logical layout; exact filenames land in Phase 3):

```text
modules/<id>/
  manifest.<ext>            # id, version, surfaces, permissions, entitlements
  backend/
  frontend/
  routes/
  migrations/
  seeders/
  settings/
```

## Enterprise (`/Users/arun/RAGSUITE_EE`)

Enterprise modules **only** — no Platform fork, no CE module copies.

```text
RAGSUITE_EE/
  README.md
  AGENTS.md
  docs/
    phases/                 # Phase prompt pack 0–15
  modules/                  # EE modules (loaded as Extensions when attached)
    sso/
    organization/
    audit_full/
    compliance/
    compare_models/
    query_tracing/
    analytics/
    mobile_beta/
    …/
  # No platform/, no cli publish, no duplicated CE modules
```

Dev attach: `RAGSUITE_EE_ROOT=/Users/arun/RAGSUITE_EE` so CE Platform scans EE `modules/` (Phase 6).  
Customers never clone this tree; they get **Bundles** (ADR-006).

## License Server (`/Users/arun/RAGSUITE_License`)

```text
RAGSUITE_License/
  README.md
  # Phase 8+ application tree, e.g.:
  #   app/                  # customers, licenses, machines, activations
  #   artifacts/            # bundle storage metadata
  #   .env.example          # ports ≠ 9090/9191/9091/5436/6382/8004
```

No RAG modules. No CE/EE source mirrors.

## Scan paths (runtime)

```text
Platform loader scans:
  1) <CE>/modules/
  2) <CE>/extensions/          # activated bundles, local installs
  + optional RAGSUITE_EE_ROOT/modules/ during development
```

## Explicit non-goals

- Do not create `RAGSUITE_PRO`.
- Do not use git submodules for EE.
- Do not merge CE / EE / License directories into one workspace root.
