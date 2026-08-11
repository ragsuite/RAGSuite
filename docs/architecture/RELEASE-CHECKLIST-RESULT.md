# Release Checklist Result (Phase 15)

**Cut:** Platform `1.0.0` · EE bundle `0.1.0` · CLI `@ragsuite/ragsuite@1.0.0`  
**Date:** 2026-07-27  
**Rules honored:** no `git push`, no `npm publish`, EE remains private, no new architecture.

**Context refresh (2026-07-31, docs only):** EE bundle version truth is `RAGSUITE_EE/VERSION` (e.g. `0.1.2`). Customer pack = paste two files + npm docs ([ACTIVATION.md](./ACTIVATION.md)). License Sync needs `release-bundle` **Release** assets — `ee-version-tag` alone is insufficient ([CICD.md](./CICD.md)). Historical rows below remain the Phase 15 cut record.

Columns: **Status** · **Evidence** · **Owner**

---

## Ship together

| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| Public CE CI (CE-alone) | **Pass** | `.github/workflows/ci.yml`; `RAGSUITE_EE_ROOT=""`; pytest `-m "not ee"` + `conftest` ignore; Phase 14: 395 passed | Platform |
| Private EE bundle CI | **Pass** | `RAGSUITE_EE/.github/workflows/ci.yml` deterministic build + artifact | EE |
| GitHub Actions draft CE release | **Pass** (path) | `.github/workflows/release.yml` creates **draft** release | Platform |
| Actual CE tag / draft publish to remote | **Waived** | Requires explicit user authorize to `git push` / tag | Release |
| npm CLI publish path | **Pass** (path) | `cli-publish.yml` gated `confirm=publish` | Platform |
| Actual `npm publish` | **Waived** | Requires explicit user authorize | Release |
| License Server CI | **Pass** | `RAGSUITE_License` pytest CI; local tests green historically | License |
| License Ops / fulfillment | **Pass** | `docs/FULFILLMENT-RUNBOOK.md` + `ops/` SPA :9201; README updated | License Ops |
| Customer Portal (public self-serve) | **Waived** | Deferred; sales-led + internal Ops only (Phase 12) | Product / future |
| Docs — Architecture | **Pass** | `docs/architecture/` ADRs + companions; README refreshed Phase 15 | Platform |
| Docs — API | **Pass** | [API-GUIDE.md](./API-GUIDE.md) → api-reference + route map | Platform |
| Docs — CLI | **Pass** | `cli/README.md`, ADR-008 | Platform |
| Docs — Extension SDK | **Pass** | [EXTENSION-SDK.md](./EXTENSION-SDK.md) | Platform |
| Docs — Community contributor | **Pass** | [CONTRIBUTING.md](../../CONTRIBUTING.md) | Platform |
| Docs — Enterprise | **Pass** | `RAGSUITE_EE/docs/ENTERPRISE-GUIDE.md` | EE |
| Docs — Migration | **Pass** | [MIGRATION-GUIDE.md](./MIGRATION-GUIDE.md) | Platform |
| Pricing matrix accuracy | **Pass** | [FEATURE-MATRIX.md](./FEATURE-MATRIX.md) Partial/Roadmap footnotes | Platform |
| CE release notes | **Pass** | [RELEASE-NOTES.md](./RELEASE-NOTES.md) | Platform |
| EE release notes | **Pass** | `RAGSUITE_EE/docs/RELEASE-NOTES.md` | EE |
| EE private release workflow | **Pass** (path) | `release-bundle.yml` (Release + tar); tags via `ee-version-tag.yml` are not Sync-ready alone | EE |
| Actual EE private release push | **Waived** | Requires explicit authorize | Release |

---

## Security

| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| License signature verify | **Pass** | `backend/vendor/ragsuite_license_verify`; `tests/test_license_tamper.py` | Platform |
| No private keys in public CE | **Pass** | Vendor keys dir = `public.pem` only; scan for `BEGIN PRIVATE KEY` / `ed25519_private` clean in CE tree | Platform |
| No private keys in EE tree | **Pass** | Scan clean | EE |
| License signing key stays private | **Pass** | `RAGSUITE_License/secrets/` gitignored; ops UI never embeds private key | License |
| Dependency scan — CE CLI | **Pass** | `npm audit` in `cli/`: **0** vulnerabilities (2026-07-27) | Platform |
| Dependency scan — backend pip | **Pass** | `pip check`: no broken requirements; `pip-audit` not installed in venv (follow-up) | Platform |
| Dependency scan — License ops | **Waived** (noted) | `npm audit`: **2 high** (`react-router` 7.12–8.2 CSRF advisory); fix via deliberate upgrade — owned follow-up | License Ops |
| Secrets in Actions only | **Pass** | Documented in [CICD.md](./CICD.md) | Platform |

---

## DX / coherence

| Item | Status | Evidence | Owner |
|------|--------|----------|-------|
| CE-only DX without EE | **Pass** | Docs + CI empty `RAGSUITE_EE_ROOT`; `doctor --dry-run` OK; independence/tamper/compat tests pass | Platform |
| Full native `npm start` smoke | **Waived** | Manual release smoke (TEST-MATRIX) | Platform/Release |
| Full Docker compose up smoke | **Waived** | CI only `compose config`; manual before prod | Platform/Release |
| Public CE + private EE + License/Ops coherent | **Pass** | This checklist + RELEASE-STRATEGY + FULFILLMENT-RUNBOOK + release notes | Release |

---

## Owned follow-ups

| Follow-up | Owner | Notes |
|-----------|-------|-------|
| Authorize git tag + draft GH release using [RELEASE-NOTES.md](./RELEASE-NOTES.md) | Release | Wire `release.yml` `--notes-file` when first tagging |
| Authorize `cli-publish.yml` `confirm=publish` | Release | Only after tag policy agreed |
| Authorize EE `release-bundle.yml` `confirm=release` | EE / Release | Keep `register_license` off until License staging ready |
| SemVer public `1.0.0` cut | Product / Release | Current coordinated cut is **0.1.x** |
| Native + Docker full boot smoke on tagged build | Platform/Release | |
| Online activate + machine rebind E2E vs License staging | License Ops | |
| Upgrade License `ops` react-router (GHSA-qwww-vcr4-c8h2) | License Ops | 2 high from npm audit |
| Install/run `pip-audit` in CE CI or release notes | Platform | |
| Product GAPS: SAML, Teams, legal hold, audit/tracing exports, mobile entitlement, seat hard-cap, Compare CE teaser | EE / Platform | [audit/GAPS.md](./audit/GAPS.md) |
| Optional public customer self-serve portal | Product | Future; not Phase 15 |
| Dependabot / CodeQL (optional) | Platform | Notes only in CICD |

---

## Acceptance

- [x] Checklist rows Pass or Waived-with-owner  
- [x] CE release notes + EE release notes filed  
- [x] Docs pack coherent (Architecture, API, CLI, Extension SDK, CONTRIBUTING, Enterprise, Migration)  
- [x] Security: verify + no public private keys + audit notes recorded  
- [x] No unauthorized push / npm publish  

**Done:** public CE loop + private EE bundle loop + license + internal ops fulfillment docs are coherent; public self-serve portal remains optional/future.
