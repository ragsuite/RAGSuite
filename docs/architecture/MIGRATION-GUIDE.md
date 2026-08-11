# Migration & Compatibility Guide (Phase 13)

Upgrade from today’s mixed monorepo install to **Platform + Modules + optional EE** without reinstall or data loss.

**Related:** [ACTIVATION.md](./ACTIVATION.md) · [ADR-004-versioning.md](./ADR-004-versioning.md) · [RELEASE-STRATEGY.md](./RELEASE-STRATEGY.md) · [backend/DEPLOY_ROLLBACK.md](../../backend/DEPLOY_ROLLBACK.md)

---

## Backup first (always)

Before any production upgrade:

```bash
pg_dump "$DATABASE_URL" > "ragsuite-backup-$(date +%F).sql"
```

Optional CI: set `BACKUP_BEFORE_MIGRATE=true` (see `backend/DEPLOY_ROLLBACK.md`).  
**Never** wipe data with `docker compose down -v` during an upgrade.

---

## Database / Alembic policy

| Rule | Detail |
|------|--------|
| Single Alembic train | All revisions live under `backend/alembic/versions/` — owned by **Platform** |
| Who runs migrations | Native start (`scripts/native-start.sh`) and Docker entrypoints call `alembic upgrade head` |
| Module `migrations:` | Manifest refs are **metadata only** (`ModuleContext.declare_migrations`) — they do not run separate Alembic trees |
| CE-only installs | May already contain EE-era tables from the shared history; unused tables are inert when EE modules are not loaded |
| Per-module Alembic | Deferred (not Phase 13) |

In-place upgrade preserves Postgres named volumes and native `data/` dirs (see Scenario 6).

---

## Compat matrix

| Artifact | Version field | Compatibility rule |
|----------|---------------|--------------------|
| Platform / CE | `PLATFORM_VERSION` (`backend/app/platform/version.py`) | SemVer |
| EE Bundle | `manifest.platform_compat` (e.g. `>=0.1.0 <2.0.0`) | Must `satisfies(PLATFORM_VERSION, platform_compat)` at install **and** boot |
| License key | `schema: "ragsuite.license.v1"` | Independent of Platform patch; wrong schema → invalid key |
| CLI | Independent SemVer | Documents Platform ranges; `doctor` reports mismatches |

```text
Platform PLATFORM_VERSION  ↔  Bundle.platform_compat  ↔  loader + doctor
License schema             =  ragsuite.license.v1     (not 1:1 with Platform patch)
```

`ragsuite doctor` exits **non-zero** when:

- ACTIVE EE bundle’s `platform_compat` does not match Platform, or
- Offline key is present but invalid / unsupported schema

Probe JSON: `python -m app.platform.compat_cli report`

---

## CLI update notes

Safe upgrade path (keeps `.env`, DB volumes, and `data/`):

1. **Backup** with `pg_dump` (above)
2. `ragsuite update`  
   - Upgrades published CLI (`npm install -g @ragsuite/ragsuite@latest`)  
   - `git pull --ff-only` in the active install  
   - If licensed + License Server reachable + bundle version set, refreshes EE when ACTIVE differs  
3. Restart (`npm start` / `ragsuite restart`) → migrations run automatically  
4. `ragsuite doctor` — confirm platform / ACTIVE / license schema  

CE never requires activate. EE activate is orthogonal to DB rebuild.

---

## Scenarios

### 1. Stay CE-only after upgrade

1. Backup → `ragsuite update` (or `git pull --ff-only`) → restart  
2. No offline key under `.ragsuite/license/`  
3. No ACTIVE under `extensions/installed/ee/` (or leave unused)  
4. Platform loads Community modules only; EE entitlements denied if any enterprise dirs appear without a key  

### 2. Dev mixed tree → CE + RAGSUITE_EE **or** CE + activated bundle

| Path | How |
|------|-----|
| DX workspace | `RAGSUITE_EE_ROOT=/Users/arun/RAGSUITE_EE` (or `npm run setup` attach) — loader scans EE `modules/` |
| Customer-like | Paste `offline.key` + tar into install paths (see [ACTIVATION.md](./ACTIVATION.md)), then `ragsuite activate --key "<install>/.ragsuite/license/offline.key" --bundle "<install>/ragsuite-ee-<ver>.tar.gz"` → ACTIVE under `extensions/installed/ee/<ver>/` |

Both can coexist; installed ACTIVE is scanned before DX EE root. Incompatible ACTIVE is **skipped** at boot (logged), CE continues.

### 3. CE → EE via activate (offline key) without DB rebuild

1. Upgrade CE as in scenario 1 (DB already at head)  
2. Obtain email pack from ops (`offline.key` + `ragsuite-ee-*.tar.gz`; sales-led — see License Ops runbook)  
3. Paste key → `<install>/.ragsuite/license/offline.key`; tar → `<install>/ragsuite-ee-<ver>.tar.gz`  
4. `ragsuite activate --key "<install>/.ragsuite/license/offline.key" --bundle "<install>/ragsuite-ee-<ver>.tar.gz" --restart`  
5. Restart — Extension loader registers entitled EE modules  
6. **No** `dropdb` / volume recreate / reinstall  

Smoke: after restart, `doctor` shows `license: valid` and enterprise extensions discovered > 0 when bundle/DX EE is present.

### 4. Renew / seat change via new signed key

1. Ops re-issues key (new `valid_to` / seats / entitlements) from License Ops Console  
2. Paste over `<install>/.ragsuite/license/offline.key` (or `ragsuite update --key "<install>/.ragsuite/license/offline.key"`)  
3. Restart — entitlement gate re-reads claims  
4. DB unchanged  

### 5. Expire / downgrade → EE off; CE data remains

| State | Behavior |
|-------|----------|
| Valid / within grace | Entitled EE modules load |
| Expired past grace / invalid / absent | EE modules skipped (`entitlement_denied`); Community continues |
| Users, projects, documents, crawl data | **Remain** in Postgres / Chroma / staging |

Remove or rotate ACTIVE only if you also want installed bundle modules off the scan path (`bundle use` / clear ACTIVE).

### 6. Docker volumes + native data dirs preserved

| Mode | Preserve |
|------|----------|
| Docker + Native | **Same** host dirs: `backend/data/chroma_db`, `backend/data/staging` (compose bind-mounts). Postgres named volume `postgres_data` — stop with compose **without** `-v` |
| Native extras | `data/redis` (if host redis), `.ragsuite/license/`, `.ragsuite/native/` |
| Both | `.env` (secrets, `DATABASE_URL`) |

Ports stay on this project’s band: API **9090**, Expo **9191**, Postgres **5436**, Redis **6382**.

---

## Acceptance (Phase 13)

| Check | How |
|-------|-----|
| Sample DB upgrade preserves users/projects | `pytest backend/tests/test_migration_upgrade_sample.py` (sqlite always; live Postgres: `RAGSUITE_MIGRATION_SAMPLE=1` + `DATABASE_URL=postgresql://…`) |
| Activate EE after upgrade enables modules without rebuild | Scenario 3 + Activation docs |
| doctor detects incompatible versions | `compat_cli` / `ragsuite doctor` non-zero on bad ACTIVE `platform_compat` or invalid license schema |

Full edition matrix QA is **Phase 14**.
