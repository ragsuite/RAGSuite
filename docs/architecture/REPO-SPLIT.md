# Repository split (Phase 5)

Public **CE** (`/Users/arun/RAGSUITE`) holds Platform, Community modules, CLI, and Shared contracts (ORM models, auth protocol, permission keys, settings names, API URL constants).

Private **EE** (`/Users/arun/RAGSUITE_EE`) holds Enterprise product Extensions only.

## Attach EE (no git submodule)

Day-to-day DX: [DEV-WORKSPACE.md](./DEV-WORKSPACE.md) (Phase 6).

```bash
cd /Users/arun/RAGSUITE
npm run setup
npm start   # auto-attaches sibling ../RAGSUITE_EE when present
```

Manual override:

```bash
export RAGSUITE_EE_ROOT=/Users/arun/RAGSUITE_EE
cd /Users/arun/RAGSUITE && npm start
```

Unset / no sibling → CE-alone. Missing EE root is soft-skipped.

## What moved (Waves 1–4)

| Module ID | Lives in | Notes |
|-----------|----------|-------|
| `mobile_beta` | `RAGSUITE_EE/modules/mobile_beta` | Entitlement metadata |
| `voice` | `RAGSUITE_EE/modules/voice` | Widget STT/TTS; CE empty composer slots |
| `compliance` | `RAGSUITE_EE/modules/compliance` | Retention UI; CE teaser via Metro stubs |
| `query_tracing` | `RAGSUITE_EE/modules/query_tracing` | Snapshot builder + deep trace UI |
| `compare_models` | `RAGSUITE_EE/modules/compare_models` | Compare APIs + profiles CRUD; CE locked teaser |
| `analytics` | `RAGSUITE_EE/modules/analytics` | Dashboard/export; CE keeps `overview` |
| `audit_full` | `RAGSUITE_EE/modules/audit_full` | Export endpoints |
| `sso` | `RAGSUITE_EE/modules/sso` | Auth SSO routes + OIDC helpers |
| `organization` | `RAGSUITE_EE/modules/organization` | Org admin product APIs + FE |

## Stayed in CE (Shared / Community)

| Surface | Location |
|---------|----------|
| `audit_basic` (list/get, 30-day window) | `modules/audit_basic` |
| `documents`, `notifications`, `system_health` | `modules/<id>` |
| Org/member/SSO **models**, `org_invite` helpers | `backend/app/models`, `services/org_invite` |
| `emit_audit`, password auth, projects | Platform + CE legacy |
| Overview home metrics | `backend/app/routes/overview.py` |
| RAG `retrieve_for_compare` / `generate_for_compare` | Shared CE RAG hooks |

## Frontend attach

Metro resolves `@ragsuite-ee` → `$RAGSUITE_EE_ROOT` when set, else `frontend/src/platform/ee-stubs`. CE feature folders are thin re-exports; teasers render when EE is absent.

Customers without EE git use **Enterprise Bundles** — see [BUNDLES.md](./BUNDLES.md).


## Non-goals (later phases)

License gates, EE publish/submodule, Alembic split, Phase 6 DX polish.
