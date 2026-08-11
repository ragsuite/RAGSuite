# RAGSuite Community — Release Notes

**Cut:** Platform `1.0.0` · CLI `@ragsuite/ragsuite@1.0.0`  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key  
**Date:** 2026-07-27 (Phase 15 coordinated checklist)

## Highlights

- **Platform + Modules + Extensions** — edition-agnostic loader; Community modules load without a license.
- **CE-only DX** — `cd /Users/arun/RAGSUITE && npm start` (API `:9090`, Expo `:9191`) with no `RAGSUITE_EE_ROOT`.
- **Offline license verify** — Ed25519 public-key verify in `backend/vendor/ragsuite_license_verify` (no private keys in CE).
- **CLI** — `doctor`, `activate`, `license`, `bundle`, `update`, `extensions` / `status`.
- **Activation** — offline key path; online activate against License Server when configured.
- **Migration** — in-place Alembic upgrade; see [MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md).
- **CI** — CE Actions run without EE checkout; EE-marked tests ignored when EE root empty.

## What is not in the public CE tree

- Enterprise module **source** (lives in private `RAGSUITE_EE`).
- License Server signing **private** keys (License product only).
- Public self-serve “buy Enterprise” portal (sales-led; internal Ops console only).

## Known limitations

See [TEST-MATRIX.md](./TEST-MATRIX.md) §Known limitations. Summary:

- EE probes run with `RAGSUITE_EE_ROOT` set (maintainer); not in public CI.
- Full native/Docker boot is a release smoke item, not a long GH Actions job.
- Windows/WSL best-effort; macOS/Linux supported.
- Product gaps (SAML, Teams, legal hold, some exports, hard seat caps) — see [audit/GAPS.md](./audit/GAPS.md).

## Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart
3. `ragsuite doctor`

## Publish status

Draft GitHub release workflow and gated npm CLI publish exist. **Actual `git push` / `npm publish` require explicit human authorization** — not performed as part of Phase 15 checklist alone.
