# CLI, scripts, Docker, CI, tests

Row format: `path | proposed module id | edition class | risk | coupling notes`

## CLI (`cli/`)

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `cli/package.json` | — | CE packaging | med | `@ragsuite/ragsuite` — only published installer |
| `cli/bin/ragsuite.js` | — | CE packaging | low | |
| `cli/src/index.js` | — | Platform | med | Command router |
| `cli/src/commands/init.js` | — | Platform | med | |
| `cli/src/commands/start.js` | — | Platform | med | |
| `cli/src/commands/stop.js` | — | Platform | med | |
| `cli/src/commands/restart.js` | — | Platform | low | |
| `cli/src/commands/doctor.js` | — | Platform | med | |
| `cli/src/commands/logs.js` | — | Platform | low | |
| `cli/src/commands/update.js` | — | Platform | med | |
| `cli/src/commands/version.js` | — | Platform | low | |
| `cli/src/utils/*` | — | Platform | low | |
| `cli/scripts/prepublish-check.js` | — | CE packaging | low | |
| `cli/test/smoke.js` | — | CE packaging | med | Guards: no CE/EE/license in help today |

**Present commands:** `init` `start` `stop` `restart` `doctor` `logs` `update` `version`  
**Absent (ADR-008 target):** `activate` `license` `bundle` `status` `extensions` `plugins`

## Root scripts

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `scripts/native-start.sh` | — | Platform | high | `npm start` |
| `scripts/native-stop.sh` | — | Platform | med | |
| `scripts/docker-start.sh` / `docker-stop.sh` | — | Platform | med | |
| `scripts/start-all.sh` | — | Platform | low | |
| `scripts/doctor.sh` | — | Platform | low | |
| `scripts/ensure-ios-pods.sh` | — | Platform | low | |
| `scripts/sync-frontend.sh` | — | Platform | low | |
| `scripts/lib/common.sh` | — | Platform | low | |
| `scripts/ci/backend-test.sh` | — | Platform | low | |
| `scripts/ci/frontend-check.sh` | — | Platform | low | |

## Docker / compose

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `docker-compose.yml` | — | Platform | med | Wires `SSO_CALLBACK_BASE_URL` (**EE-related** env) |
| `docker-compose.dev.yml` | — | Platform | low | |
| `docker-compose.production.yml` | — | Platform | low | |
| `docker/backend.Dockerfile` | — | Platform | low | |
| `docker/frontend.Dockerfile` | — | Platform | low | |
| `docker/backend-entrypoint.sh` | — | Platform | low | |
| `docker/nginx.conf` | — | Platform | low | Web `:9091` |

## Env examples (names only)

| path / key | proposed module id | edition class | risk | coupling notes |
|------------|-------------------|---------------|------|----------------|
| `.env.example` → `SSO_ENABLED` | `sso` | EE | med | |
| `.env.example` → `SSO_REQUIRE_REDIS` | `sso` | EE | low | |
| `.env.example` → `SSO_CALLBACK_BASE_URL` | `sso` | EE | med | |
| `.env.example` → `COMPARE_MODEL_CONFIG_SOURCE` | `compare_models` | EE | med | |
| `backend/.env.example` (same SSO/COMPARE keys) | `sso` / `compare_models` | EE | med | |
| License / PRODUCT_EDITION / SAML / SCIM keys | — | — | — | **Absent** |

Frontend: `EXPO_PUBLIC_PRODUCT_EDITION` via `product-edition.ts` (cosmetic).

## CI

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `.github/workflows/ci.yml` | — | Platform + CE packaging | med | backend, frontend, compose, CLI smoke |
| `.github/workflows/cli-publish.yml` | — | CE packaging | med | npm publish CLI only |

No License Server or EE bundle workflows yet.

## Tests

| path | proposed module id | edition class | risk | coupling notes |
|------|-------------------|---------------|------|----------------|
| `backend/tests/test_sso_google.py` | `sso` | EE | med | |
| `backend/tests/test_organization*.py`, `test_org_*`, `test_member_project_acl.py`, `test_org_project_permissions.py` | `organization` | EE | high | |
| `backend/tests/test_compare_*.py` | `compare_models` | EE | med | |
| `backend/tests/test_analytics_export.py` | `analytics` | EE | med | |
| Remaining `backend/tests/test_*.py` | mixed CE / Platform | CE / Platform | med | Auth, crawl, docs, widgets, jobs, … |
| `frontend/src/**/*.test.ts` | mixed | CE / EE | low | Analytics charts lean EE |
| `cli/test/*` | — | Platform / CE packaging | low | |

## Acceptance — ops

- [x] CLI, scripts, Docker, env, CI, tests inventoried and classified
