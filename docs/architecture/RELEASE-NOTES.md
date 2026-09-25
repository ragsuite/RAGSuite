# RAGSuite Community — Release Notes

## 1.0.6 (2026-09-25)

**Cut:** Platform `1.0.6` · CLI `@ragsuite/ragsuite@1.0.6` · EE bundle `1.0.6` (`ee-v1.0.6`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Highlights

- Coordinated Platform / CLI / EE bundle cut to `1.0.6`.

### Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart
3. `ragsuite doctor`
4. Enterprise: install `ragsuite-ee-1.0.6.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md)

---

## 1.0.5 (2026-09-25)

**Cut:** Platform `1.0.5` · CLI `@ragsuite/ragsuite@1.0.5` · EE bundle `1.0.5` (`ee-v1.0.5`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Highlights

- MCP Connector: outbound MCP so Cursor, Claude Desktop, and Manus can search knowledge and operate the product. Personal MCP keys carry a scope and active project. Setup lives under Management → MCP.
- Chat widget language picker with flags, separate from the header menu.
- Search embed language menu no longer shifts the host page. Wheel scrolling stays inside the list until it reaches the end.
- Docker Compose `DATABASE_URL` uses the `postgresql+psycopg2` driver.

### Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart
3. `ragsuite doctor`
4. Enterprise: install `ragsuite-ee-1.0.5.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md)

---

## 1.0.4 (2026-09-18)

**Cut:** Platform `1.0.4` · CLI `@ragsuite/ragsuite@1.0.4` · EE bundle `1.0.4` (`ee-v1.0.4`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Highlights

- Chat message translation (“Translate this chat”) and visitor-language UX for Chatbot/Search embeds.
- AI Assistant module (sessions, messages, Sources mode, citations, preferences).
- Chatbot widget customization (hero, privacy notice, FAQ, disclaimer, logo shape/radius, layouts, pop-out).
- Microsoft Teams connector; entitlements gating; dynamic LLM API-key resolution; system-health snapshot.
- CE release drafts: CycloneDX SBOM + cosign keyless signing.

### Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart
3. `ragsuite doctor`
4. Enterprise: install `ragsuite-ee-1.0.4.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md)

---

## 1.0.3 (2026-09-07)

**Cut:** Platform `1.0.3` · CLI `@ragsuite/ragsuite@1.0.3` · EE bundle `1.0.3` (`ee-v1.0.3`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Highlights

- Chat/Search embed reliability: close cover thrash fixed; faster embed first paint (skip Skia on `/embed/*`, non-blocking avatars, search paint-then-enrich).
- Chat widget `data-container` support so hosts can mount under a persist root without post-reveal reparent (iframe reload blink).
- Dashboard resilience: crawl Sources remain visible if documents/coverage fail; online badge uses lightweight `/api/v1/health` instead of heavy system-health probes.
- Crawl UX: manual recrawl confirmation, diagnostics capacity, document panel refinements.

### Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart
3. `ragsuite doctor`
4. Enterprise: install `ragsuite-ee-1.0.3.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md)

---

## 1.0.0 (2026-07-27)

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
- Product gaps (SAML, legal hold, some exports, hard seat caps) — see [audit/GAPS.md](./audit/GAPS.md). Org RBAC Team Members and Microsoft Teams Sources connector are shipped (distinct features).

## Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart
3. `ragsuite doctor`

## Publish status

Draft GitHub release workflow and gated npm CLI publish exist. **Actual `git push` / `npm publish` require explicit human authorization** — not performed as part of Phase 15 checklist alone.
