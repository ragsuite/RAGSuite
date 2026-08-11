# Developer workspace (Phase 6)

CE and EE should feel like **one** local workspace. Attach is path-based (no git submodule, no EE npm publish).

Primary DX: native stack from the CE root (`npm start`).

## Trees (siblings)

| Path | Role |
|------|------|
| `/Users/arun/RAGSUITE` | Community (Platform + CE modules + CLI) |
| `/Users/arun/RAGSUITE_EE` | Enterprise modules only (optional) |

## Resolve order

1. `RAGSUITE_EE_ROOT` if set and is a directory (override)
2. Else sibling `../RAGSUITE_EE` next to the CE clone
3. Else CE-only (loaders soft-skip; Metro uses `frontend/src/platform/ee-stubs`)

Resolved path is written to `.ragsuite/ee-root` (gitignored).

## Internal developer (CE + EE)

```bash
# Clone both as siblings, e.g. under /Users/arun/
#   RAGSUITE/
#   RAGSUITE_EE/

cd /Users/arun/RAGSUITE
npm run setup          # .env, backend venv, yarn install, EE discovery
npm start              # auto-attaches ../RAGSUITE_EE
# API :9090 · Expo :9191
npm run stop
```

Sibling auto-detect means you usually **do not** need to export `RAGSUITE_EE_ROOT`.

### Override

```bash
export RAGSUITE_EE_ROOT=/custom/path/to/RAGSUITE_EE
cd /Users/arun/RAGSUITE
npm start
```

## Community contributor (CE-only)

```bash
cd /path/to/RAGSUITE
npm run setup
npm start              # no sibling EE → CE-only
npm run stop
```

No private EE clone required. EE Extension packages are not loaded; EE UI surfaces show locked teasers where applicable.

## What gets wired

| Layer | Mechanism |
|-------|-----------|
| Backend | `RAGSUITE_EE_ROOT` → `extension_loader` scans `modules/` + `extensions/` |
| Frontend | Metro `@ragsuite-ee` → EE root (or stubs if unset) |
| Docker | `npm run start:docker` auto-attaches sibling/`ACTIVE` EE into backend `/ee` **and** the frontend build context (same path). Raw `docker compose up` is CE-only unless `RAGSUITE_EE_DOCKER_CONTEXT` points at the EE tree. |

## Commands cheat sheet (macOS)

```bash
cd /Users/arun/RAGSUITE
npm run setup              # same as npm run prepare:workspace
npm start                  # native CE (+ EE if sibling/override)
npm run stop               # stop host PIDs only (keeps data volumes)
npm run start:docker       # Docker stack CE+EE when sibling EE / ACTIVE bundle exists
```

## Related

- [REPO-SPLIT.md](./REPO-SPLIT.md) — what moved in Phase 5
- [ADR-007-repository-strategy.md](./ADR-007-repository-strategy.md) — attach model
- [EXTENSION-FRAMEWORK.md](./EXTENSION-FRAMEWORK.md) — loader scan order
