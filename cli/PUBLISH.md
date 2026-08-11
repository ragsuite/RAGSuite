# Publishing `@ragsuite/ragsuite`

> Public package: **`@ragsuite/ragsuite`** · bin: **`ragsuite`**.  
> GitHub repo should be **public** for `init` on other machines.

**Push / PR never publishes.** Only the manual Actions workflow (or an explicit local allow env) may publish.

Do **not** publish unless someone explicitly says **“publish now”**.

---

## Version

Current: **`1.0.0`** — same value in:

| Place | Value |
|------|--------|
| npm | `@ragsuite/ragsuite@1.0.0` |
| `cli/package.json` | `"version": "1.0.0"` |
| GitHub tag | **`v1.0.0`** (created automatically on push to `main` if missing) |

Bump `cli/package.json` + `cli/package-lock.json` together before a publish.  
After you push that bump to `main`, workflow **CLI version tag** creates `v{version}` on GitHub (if it does not exist yet).

---

## Pre-publish gates (all must PASS)

| Gate | Command / check |
|------|-----------------|
| CLI name | `@ragsuite/ragsuite` |
| CLI bin | `ragsuite` |
| Root private | `"private": true` in root `package.json` |
| Prepublish | `cd cli && npm run prepublish:check` |
| Smoke | `cd cli && npm test` |
| Pack | `cd cli && npm pack && node test/pack-assert.js ./ragsuite-ragsuite-*.tgz` |
| CI on push | All jobs in `.github/workflows/ci.yml` (checks only — no npm publish) |
| Docs | help must not advertise removed ZIP or container-image install paths |

---

## Publish (only when you say “publish now”)

1. Confirm `cli/package.json` version is correct (and GitHub already has tag `v{version}`, or let publish workflow create it)
2. GitHub → Actions → **CLI publish** → Run workflow → `confirm` = `publish`  
   (needs secret `NPM_TOKEN`)  
   **or** locally after checklist: `cd cli && RAGSUITE_TEST_ALLOW_PUBLISH=1 npm publish --access public`

Draft GitHub Release (no npm): pushing/creating tag `v*` triggers `.github/workflows/release.yml` as a **draft** only.

App distribution: **git clone + native scripts** (`ragsuite init` → `start`).

---

## Post-publish verification (another machine)

```bash
npm install -g @ragsuite/ragsuite@1.0.0
ragsuite version
ragsuite init
ragsuite start
curl -sS http://localhost:9090/api/v1/crawl/auth/public-config | head
ragsuite stop
ragsuite update --restart
```

---

## Out of scope

- Container image registry deploy paths
- ZIP-based app installs
