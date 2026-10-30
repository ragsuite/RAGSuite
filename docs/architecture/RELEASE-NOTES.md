# RAGSuite Community — Release Notes

## Unreleased

—

---

## 1.0.9 (2026-10-30)

**Cut:** Platform `1.0.9` · CLI `@ragsuite/ragsuite@1.0.9` · EE bundle `1.0.9` (`ee-v1.0.9`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Upgrade from 1.0.8

1. Update to Platform / CLI `1.0.9` (`ragsuite update --restart` or pull + `npm start`).
2. Enterprise: install `ragsuite-ee-1.0.9.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md). Do **not** `docker compose down -v`.

---

## 1.0.8 (2026-10-19)

**Cut:** Platform `1.0.8` · CLI `@ragsuite/ragsuite@1.0.8` · EE bundle `1.0.8` (`ee-v1.0.8`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Highlights

**Vector store: Chroma → pgvector**

- Vectors are stored in the existing Postgres with pgvector (schema `ragvec`, one table + HNSW index per collection). The separate Chroma service, its port and the `CHROMA_*` settings are gone.
- The Postgres image becomes `postgres:15-alpine` + pgvector (`docker/postgres.Dockerfile`); the existing `postgres_data` volume is reused as-is.
- Retrieval keeps Chroma's distance semantics and metadata filters, so ranking and scoping behave as before.
- A one-shot `vector-migrate` step imports Chroma into pgvector and verifies every row before the API starts.

**Project access permissions**

- Permission tree rebuilt to match the app sidebar and tabs.
- Sources are granular: Domain, Sitemap, Documents, Text, and Q&A.
- Model Configuration is an independent switch (`model_configuration:manage`).
- Management is MCP-only; Admin Assistant is a single switch.
- System Health and Audit are always visible; denied routes redirect; Audit returns 404 for non-owners.
- In-app chat launcher follows Chatbot leaf permissions; Model Settings hide when Model Configuration is off.
- "View All Projects" is hidden for members with zero projects.
- Permission strings updated in en, de, fr, es, pt, ar, zh (en-gb falls back to en).

**Platform**

- Feedback moderation: clear and summary features for operators.
- Chat history and admin activity management improvements.
- Chatbot and Search widget accuracy improvements; consistent cache behaviour in RAG tests.
- Project-wide retrieval settings; document and source "use in answers" flags; RAG chunk LLM context; catalog items.
- Chat widget: Clear Conversation control removed.
- Onboarding and authentication components refactored.

### Upgrade from 1.0.7 or earlier (Chroma-based)

1. Back up: `pg_dump "$DATABASE_URL" > backup.sql` and a tar of `backend/data/chroma_db`.
2. Start with the full command: `docker compose up -d --build` (or `npm start` / `ragsuite update --restart`). Do **not** use `--no-deps backend` for this first start: the API would run before the import.
3. The one-shot `vector-migrate` step imports Chroma into pgvector, builds the index and verifies every row before the API starts. `docker compose logs vector-migrate` must show `migration complete: N collection(s), M rows`; later starts show `already migrated`. If verification fails, the API stays down and Chroma data is untouched — fix and re-run (it resumes).
4. Chroma data in a non-default location: set `CHROMA_HOST_PERSIST_PATH` (Docker) or `CHROMA_PERSIST_PATH` (native) before step 2. `no legacy Chroma data found` on an install that had Chroma means the path is wrong.
5. Non-Docker Postgres: install pgvector for your PostgreSQL version and run `CREATE EXTENSION vector;` once as superuser in the RAGSuite database.
6. Alembic revisions are remapped automatically; run `ragsuite doctor` after upgrade.
7. Delete `backend/data/chroma_db` only after verifying answers; then `docker compose up -d --remove-orphans` removes the old `chromadb` container.
8. Enterprise: install `ragsuite-ee-1.0.8.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md). Do **not** `docker compose down -v`.

---

## 1.0.7 (2026-10-12)

**Cut:** Platform `1.0.7` · CLI `@ragsuite/ragsuite@1.0.7` · EE bundle `1.0.7` (`ee-v1.0.7`)  
**Edition:** Community (public) + optional Enterprise via private bundle / sales-led key

See GitHub release body for the line-item `[FEATURE]` / `[BUGFIX]` / `[TASK]` list.

### Highlights

**Enterprise SSO**

- Microsoft Entra ID as a second org SSO provider (same OIDC + PKCE shell as Google).
- Independent Google / Microsoft tabs; Sign in with Microsoft; colourful Microsoft logo.
- Real Test connection (discovery + JWKS + token probe); missing or wrong values fail.
- User-friendly translated errors in en, en-gb, de, fr, es, pt, zh, ar (no snake_case keys).
- Same email can link both IdPs; GUID tenants use `common`; unique `(org_id, provider)`.

**Community platform**

- **Voice (mic / speaker) and AI Voice Pilot are now Community modules.** `modules/voice` and `modules/ai_voice_pilot` ship in CE with their frontends (`features/voice`, `features/ai-voice-pilot`); no license, entitlement, or Lock badge is required. Enterprise no longer ships these modules.
- Org-wide workspace branding (logo / name / color).
- Project model providers (including Azure OpenAI endpoint / API version).
- Per-project retention; search widget disclaimer; chat session metadata / summary.
- Lexical RAG index (`rag_chunk_lexical_index`); crawl source type; site header/footer indexing.
- Mobile API keys (revoke legacy project keys); Chroma repair; system footer; compare models.

### Upgrade

1. `pg_dump "$DATABASE_URL" > backup.sql`
2. `ragsuite update` (or `git pull --ff-only`) → restart — or `docker compose up -d --build` (rebuilds images; does **not** wipe `postgres_data` / `backend/data`)
3. `ragsuite doctor`
4. Enterprise: install `ragsuite-ee-1.0.7.tar.gz` / activate per [ACTIVATION.md](./ACTIVATION.md)
5. Do **not** `docker compose down -v`

Voice Pilot: no database migration beyond the existing `voice_pilot_settings` table; existing settings and chatbot `widget_voice_pilot_*` fields are kept. EE bundles that still contain `voice` / `ai_voice_pilot` are harmless — the CE copies load first and the EE duplicates are skipped.

---

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
- Admin Assistant module (sessions, messages, Sources mode, citations, preferences).
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
- **CE-only DX** — `cd /path/to/RAGSUITE && npm start` (API `:9090`, Expo `:9191`) with no `RAGSUITE_EE_ROOT`.
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
