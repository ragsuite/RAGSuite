# CI/CD (Phase 11)

Phase 11 defines CI/CD across Community, Enterprise, and License Server with explicit safety gates.

## Pipeline map

| Repo | Workflow | Purpose | Safe by default |
|---|---|---|---|
| `RAGSUITE` | `.github/workflows/ci.yml` | CE backend/frontend/compose/CLI CI | yes |
| `RAGSUITE` | `.github/workflows/cli-publish.yml` | Manual npm publish of `@ragsuite/ragsuite` | yes (`workflow_dispatch` + `confirm=publish`) |
| `RAGSUITE` | `.github/workflows/release.yml` | Draft CE GitHub release notes | yes (draft release only) |
| `RAGSUITE_EE` | `.github/workflows/ci.yml` | Deterministic EE bundle build + artifact upload | yes |
| `RAGSUITE_EE` | `.github/workflows/ee-version-tag.yml` | Creates tag `ee-v{VERSION}` only (no tar, no GitHub Release) | yes |
| `RAGSUITE_EE` | `.github/workflows/release-bundle.yml` | Builds `ragsuite-ee-{VERSION}.tar.gz` + **private GitHub Release** + optional License register | yes (auto on `VERSION` push; manual needs `confirm=release`) |
| `RAGSUITE_License` | `.github/workflows/ci.yml` | License Server pytest | yes |
| `RAGSUITE_License` | `.github/workflows/deploy.yml` | Deploy pipeline stub | yes (no real deploy actions) |

**License Sync rule:** Ops **Sync from GitHub** imports **Releases** that include asset `ragsuite-ee-*.tar.gz`. Tags from `ee-version-tag.yml` alone are **not** enough. Repo stays **private**; a private Release does not make the EE repo public.

## CE without EE checkout

Community CI must pass without checking out `RAGSUITE_EE`.

- Backend CI runs pytest with `PYTEST_MARK_EXPR="not ee"` and EE-dependent tests marked `@pytest.mark.ee`.
- When `RAGSUITE_EE_ROOT` is empty, `backend/conftest.py` **ignores collection** of EE-marked test modules (soft EE shims lack symbols — avoids ImportError during collection).
- Maintainer DX: set `RAGSUITE_EE_ROOT` to the private EE tree and run `pytest -m ee`.
- Frontend Jest maps `@ragsuite-ee/*` imports to `frontend/src/platform/ee-stubs/*`.
- CI never sets `RAGSUITE_EE_ROOT` in CE workflows.

Full Pass/Waived matrix: [TEST-MATRIX.md](./TEST-MATRIX.md).

## Versioning

| Artifact | Source | Version source | Release trigger |
|---|---|---|---|
| CE app + CLI docs | `RAGSUITE` | repo tag `vX.Y.Z` + `cli/package.json` | push tag / manual draft |
| CLI npm package | `RAGSUITE/cli` | `cli/package.json` | manual publish workflow only |
| EE bundle tarball | `RAGSUITE_EE` | repo-root `VERSION` | `release-bundle.yml` (Release + tar); tag-only via `ee-version-tag.yml` |
| License Server | `RAGSUITE_License` | repo-root `VERSION` / `license-v*` | own CI + deploy stub |

## Secrets (repo settings only)

Never commit secrets to git. Workflows read secrets from GitHub Actions settings.

| Secret | Repo | Used for |
|---|---|---|
| `NPM_TOKEN` | `RAGSUITE` | manual CLI publish |
| `LICENSE_API_URL` | `RAGSUITE_EE` | optional bundle metadata register |
| `LICENSE_ADMIN_TOKEN` | `RAGSUITE_EE` | auth for License metadata register |
| `EE_RELEASE_TOKEN` | `RAGSUITE_EE` | optional Contents: Write PAT if `GITHUB_TOKEN` cannot create Releases |
| `RAGSUITE_BUNDLE_SIGN_KEY` | `RAGSUITE_EE` | optional PEM for signed release tars |
| `GITHUB_EE_TOKEN` | `RAGSUITE_License` | Contents: **Read** — License Sync + asset download (not Actions write) |
| runtime signing keys | License runtime only | offline key issuance; never in CE/EE repos |

## Dry-run vs real release procedures

### CE (Community)

1. Open CI for branch/PR and ensure `.github/workflows/ci.yml` is green.
2. Run/inspect `cli-publish-dry-run` job output in CI.
3. Run `.github/workflows/release.yml` (or tag push) to create **draft** release notes.
4. Real npm publish happens only if a maintainer manually runs `cli-publish.yml` with `confirm=publish`.

### EE (Enterprise bundle)

1. Bump repo-root `VERSION` on `main` (triggers `ee-version-tag` + `release-bundle`) **or** manually run `release-bundle.yml` with `confirm=release` (leave version empty to use `VERSION`).
2. Ensure EE repo **Settings → Actions → General → Workflow permissions = Read and write** (so Releases can be created on the private repo).
3. Confirm a GitHub **Release** exists for `ee-v{VERSION}` with asset `ragsuite-ee-{VERSION}.tar.gz` (not tag-only).
4. License Ops → **Bundles → Sync from GitHub** (or optional auto-register when `LICENSE_API_URL` + `LICENSE_ADMIN_TOKEN` are set).
5. Keep `register_license` off for dry runs when License staging is not ready.

### License Server

1. CI (`pytest`) must pass.
2. `deploy.yml` is intentionally a stub in Phase 11; it validates importability only and does not deploy infrastructure.

## Dependency scan notes (Phase 15)

Record periodic `npm audit` (CE `cli/`, License `ops/`) and `pip check` / `pip-audit` (backend) results in [RELEASE-CHECKLIST-RESULT.md](./RELEASE-CHECKLIST-RESULT.md). Do not commit secrets; Dependabot/CodeQL may be added later without changing product architecture.

## Related docs

- [RELEASE-STRATEGY.md](./RELEASE-STRATEGY.md)
- [RELEASE-NOTES.md](./RELEASE-NOTES.md)
- [RELEASE-CHECKLIST-RESULT.md](./RELEASE-CHECKLIST-RESULT.md)
- [ACTIVATION.md](./ACTIVATION.md)
- [ADR-006-bundles.md](./ADR-006-bundles.md)
- [ADR-008-cli.md](./ADR-008-cli.md)
