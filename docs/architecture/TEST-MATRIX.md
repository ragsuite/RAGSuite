# Test Matrix (Phase 14)

Full CE/EE platform matrix. Every row is **Pass** or **Waived** with an owner.  
Sev-1 boot/data-loss blockers must be fixed (not waived).

**Related:** [CICD.md](./CICD.md) · [MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md) · [ACTIVATION.md](./ACTIVATION.md) · [FEATURE-MATRIX.md](./FEATURE-MATRIX.md) · [audit/GAPS.md](./audit/GAPS.md)

## How to run

```bash
# CE-alone (matches public CI) — EE-marked tests are not collected
cd backend && RAGSUITE_EE_ROOT= pytest tests/ -q -m "not ee"

# Maintainer CE+EE workspace probes
export RAGSUITE_EE_ROOT=/Users/arun/RAGSUITE_EE
cd backend && pytest tests/ -q -m ee

# Module independence
pytest tests/test_module_independence.py -q

# CLI smoke
cd cli && npm test
```

When `RAGSUITE_EE_ROOT` is empty/unset, [`backend/conftest.py`](../../backend/conftest.py) ignores collection of EE-marked test modules so soft shims do not break CE CI.

---

## Matrix

| Scenario | How verified | Status | Owner | Notes |
|----------|--------------|--------|-------|-------|
| CE-only core flows | CE pytest `-m "not ee"` + frontend Jest (ee-stubs) + CLI CI jobs | **Pass** | Platform | Sev-1 collection fixed Phase 14 |
| CE+EE workspace | `npm run setup` / `RAGSUITE_EE_ROOT` + local `pytest -m ee` | **Pass** | Platform | Maintainer DX; not required in public CE Actions |
| CE+EE bundle | EE CI bundle build + `test_bundle.py` (ee) when EE attached | **Pass** | EE | Artifact from `RAGSUITE_EE` CI |
| Activate offline | CLI smoke (`cli/test/smoke.js`) + entitlements unit tests | **Pass** | Platform | Key under `.ragsuite/license/` |
| Activate online | License Server activation APIs + CLI code path | **Waived** | License Ops | Full E2E needs License staging; policy covered by License CI |
| Expired license | `test_license_entitlements.py` (past grace → EE denied, CE ok) | **Pass** | Platform | |
| Tampered license rejected | `test_license_tamper.py` (bad sig / garbage / wrong signer / bad schema) | **Pass** | Platform | |
| Tampered bundle rejected | `test_bundle.py` verify tamper (ee path) | **Pass** | EE | Run with `RAGSUITE_EE_ROOT` |
| Machine change / rebind | License `test_activation_policy.py` + CLI `--rebind` | **Waived** | License Ops | Seat/rebind policy in License CI; CLI E2E manual |
| Upgrade platform/extensions | `update --dry-run` CLI + MIGRATION-GUIDE checklist | **Pass** | Platform | Full boot upgrade = manual smoke (see Waived row below) |
| Rollback ACTIVE bundle | CLI `bundle use` dry-run / smoke | **Pass** | Platform | Full install+rollback = maintainer manual |
| DB migration sample | `test_migration_upgrade_sample.py` (sqlite always) | **Pass** | Platform | Live PG: `RAGSUITE_MIGRATION_SAMPLE=1` |
| Live Postgres migration dump | Opt-in alembic sample | **Waived** | Platform | Manual / opt-in env; not default CI |
| CLI commands | `ci.yml` cli-* jobs + `cli/test/smoke.js` | **Pass** | Platform | |
| Native full boot in CI | — | **Waived** | Platform/Release | Use local `npm start`; CI uses dry-run/doctor |
| Docker full `compose up` in CI | `docker compose config -q` only | **Waived** | Platform/Release | Manual smoke before release |
| macOS / Linux | Native scripts + CI runners (Linux) + macOS DX | **Pass** | Platform | |
| Windows / WSL | Docs notes only | **Waived** | Docs | Unsupported / best-effort; see CLI README |
| CE CI without EE | `ce-alone-guard` + empty `RAGSUITE_EE_ROOT` + ignore EE collect | **Pass** | Platform | |
| EE bundle CI | `RAGSUITE_EE/.github/workflows/ci.yml` | **Pass** | EE | |
| Workspace DX | `prepare-workspace.sh` / DEV-WORKSPACE.md | **Pass** | Platform | Soft-skip if EE absent |
| Doctor incompat versions | `test_compat.py` + `compat_cli` | **Pass** | Platform | Phase 13 |
| Module independence | `test_module_independence.py` | **Pass** | Platform | No module→module imports |

### EE module probes (when licensed + EE attached)

| Scenario | How verified | Status | Owner | Notes |
|----------|--------------|--------|-------|-------|
| SSO (Google OIDC) | `test_sso_google.py` (`pytest -m ee`) | **Pass** | EE | SAML / generic OIDC incomplete → GAPS |
| Org / RBAC | `test_organization.py`, `test_org_invite_setup.py`, ACL unit tests | **Pass** | EE | No Teams entity → GAPS Waive below |
| Audit exports | List/get covered; CSV/JSON export product | **Waived** | EE backlog | GAPS: audit export API missing |
| Compare models | `test_compare_retrieval.py` (`-m ee`) | **Pass** | EE | CE locked teaser gap → GAPS |
| Query tracing | Trace UI smoke / manual | **Waived** | EE backlog | Export product incomplete (GAPS) |
| Advanced analytics | `test_analytics_export.py` (`-m ee`) | **Pass** | EE | |
| Mobile entitlement | — | **Waived** | EE backlog | Expo exists; license entitlement gate missing (GAPS) |
| SAML / Teams / legal hold | — | **Waived** | EE backlog | Product incomplete (GAPS) |
| Seat enforcement | License seats field only | **Waived** | Platform + License | App does not hard-cap seats yet (GAPS) |

---

## Sev-1 register (Phase 14)

| ID | Issue | Resolution |
|----|-------|------------|
| P14-S1 | CE pytest collection ImportError on EE-marked tests / documents shim | Fixed: `pytest_ignore_collect` when EE root empty; documents test imports `ragsuite_modules.documents` |
| P14-S1b | Widget security tests patched `app.auth.*` after Platform move | Fixed: monkeypatch `app.platform.auth.*` |

No open Sev-1 boot or data-loss bugs after Phase 14.

---

## Known limitations (release notes)

Copy-ready bullets:

- Community CI does not checkout Enterprise sources; EE-marked backend tests run only when `RAGSUITE_EE_ROOT` points at a private EE tree.
- Enterprise is sales-led (no public self-serve license portal); ops fulfill keys via License Ops Console.
- Full native and Docker stack boot is a release smoke checklist item — not enforced as a long-lived GitHub Actions job.
- Windows / WSL is best-effort; supported developer platforms are macOS and Linux.
- Online activate and machine rebind end-to-end against a production License Server are ops procedures; License Server unit tests cover seat/activation policy.
- Incomplete Enterprise product surfaces (SAML, Teams, legal hold, audit CSV export product, query-tracing exports, mobile license entitlement, hard seat caps) remain roadmap — see architecture audit GAPS.
- Live Postgres migration preservation sample is opt-in (`RAGSUITE_MIGRATION_SAMPLE=1`); default CI uses an in-memory schema re-apply sample.

---

## Acceptance (Phase 14)

- [x] Every matrix row Pass or Waived-with-owner  
- [x] No open Sev-1 boot/data-loss bugs  
- [x] Module independence smoke in CE CI  

Phase 15 = production release checklist (not this document).
