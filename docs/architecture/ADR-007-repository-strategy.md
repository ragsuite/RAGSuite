# ADR-007 — Repository strategy

## Status

Accepted (Phase 0 freeze)

## Context

Community must become a clean public tree. Enterprise source and License Server must stay private. Developers need one-command DX without git submodules.

## Decision

### Three trees

| Path | Visibility | Contents |
|------|------------|----------|
| `/path/to/RAGSUITE` | Public (later) | Platform + Community modules + CLI + Shared contracts + docs |
| `/path/to/RAGSUITE_EE` | Private | Enterprise modules **only** (as Extensions) |
| `/path/to/RAGSUITE_License` | Private | License Server only (Phase 8+) |

Forbidden sibling clones for this work: `/path/to/legacy-backend-clone`, `/path/to/legacy-mobile-clone`.

Do **not** use folder name `RAGSUITE_PRO` — that naming is retired.

### Attach model (no git submodule)

- Development links EE via workspace/path: environment variable **`RAGSUITE_EE_ROOT`** (and Phase 6 tooling).
- No git submodule between CE and EE.
- No merging of git histories across CE ↔ EE ↔ License.
- CE must run when `RAGSUITE_EE` / `RAGSUITE_EE_ROOT` is absent.

### Duplication rule

After Phase 5 split:

- **Zero** Enterprise module source in the public CE tree
- **Zero** duplicated files between CE and EE (Shared contracts live in CE; EE depends on published/shared contracts, not copies of CE modules)

### License Server

Separate remote and deploy. Authorizes downloads and issues keys; does not host module source as an editable app monorepo.

## Consequences

- Phase 5 moves EE-classified code into `RAGSUITE_EE`.
- Phase 6 makes `npm start` feel like one workspace when EE is attached.
- Phase 11 uses separate CI for public CE vs private EE bundles vs License Server.
