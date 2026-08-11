# Enterprise Bundles (Phase 7)

Customers receive EE capabilities as a **versioned bundle**, never the private `RAGSUITE_EE` git tree. ADR: [ADR-006-bundles.md](./ADR-006-bundles.md).

## Artifact

```text
ragsuite-ee-<semver>/
  manifest.json       # version, platform_compat, modules, entitlement_ids, signature: null
  CHECKSUMS.sha256
  signature           # required Ed25519 over CHECKSUMS.sha256 (vendor-signed)
  modules/<id>/       # bytecode (.pyc) + frontend assets + manifest.yaml
ragsuite-ee-<semver>.tar.gz
```

## Build (private EE machine / CI)

Use the **same Python** as CE (`backend/.venv`) for reproducible bytecode:

```bash
cd /Users/arun/RAGSUITE_EE
SOURCE_DATE_EPOCH=0 /Users/arun/RAGSUITE/backend/.venv/bin/python -m tools.bundle.build \
  --version 0.1.0 --out dist
```

Two builds with the same `SOURCE_DATE_EPOCH` and version must produce identical `CHECKSUMS.sha256` / tarball hashes.

## Install (customer CE — no EE git)

Customer pastes vendor attachments into the install root (default `~/ragsuite`), then activates. See [ACTIVATION.md](./ACTIVATION.md) and `cli/README.md`.

| File | Path |
|------|------|
| `offline.key` | `<install>/.ragsuite/license/offline.key` |
| `ragsuite-ee-<ver>.tar.gz` | `<install>/ragsuite-ee-<ver>.tar.gz` |

Preferred (gates license + signed tar):

```bash
ragsuite activate \
  --key "<install>/.ragsuite/license/offline.key" \
  --bundle "<install>/ragsuite-ee-<ver>.tar.gz" \
  --restart
# or, with key already installed:
ragsuite bundle install "<install>/ragsuite-ee-<ver>.tar.gz"
```

Low-level (same gates):

```bash
cd backend && .venv/bin/python -m app.platform.bundle_install /path/to/ragsuite-ee-<ver>.tar.gz
# or:
bash scripts/bundle-install.sh /path/to/ragsuite-ee-<ver>.tar.gz
```

Install layout (after activate / bundle install):

- `extensions/installed/ee/<version>/` — verified payload
- `extensions/installed/ee/ACTIVE` — active version string
- `backend/data/extensions/ee-current` — diagnostic marker

## Verify

```bash
cd backend
.venv/bin/python -m app.platform.bundle_verify /path/to/ragsuite-ee-0.1.0.tar.gz
```

Fails on checksum mismatch or `platform_compat` vs `PLATFORM_VERSION` (`app.platform.version`).

## Loader scan order (Phase 7)

1. CE `modules/`
2. CE `extensions/` (inventory / future plugins)
3. **Installed bundle** `extensions/installed/ee/<ACTIVE>/modules` (if `ACTIVE` present)
4. `$RAGSUITE_EE_ROOT/modules|extensions` (Phase 6 DX)

CE without bundle and without `RAGSUITE_EE_ROOT` → Community only.

## DX vs customer

| Mode | EE source |
|------|-----------|
| Internal developer | Sibling / `RAGSUITE_EE_ROOT` (Phase 6) |
| Customer | Installed bundle only |

## Signature & rollback

- **Customer / production:** non-empty Ed25519 `signature` over `CHECKSUMS.sha256` is **required** (same public key as offline licenses). Empty or missing signature → install refused.
- **Lab only (signature):** `RAGSUITE_ALLOW_UNSIGNED_BUNDLE=1` or `bundle install --allow-unsigned`
- **Offline key (required):** install and EE load always need valid/grace `offline.key` — no unlicensed env bypass
- Rollback: `ragsuite bundle use <version>` flips `ACTIVE` without deleting other installs

Preferred customer install (after paste paths above):

```bash
ragsuite activate \
  --key "<install>/.ragsuite/license/offline.key" \
  --bundle "<install>/ragsuite-ee-0.1.0.tar.gz" \
  --restart
# later (new tar at <install>/…):
ragsuite update --bundle "<install>/ragsuite-ee-0.2.0.tar.gz" --restart
```

See [ACTIVATION.md](./ACTIVATION.md).

## Non-goals (later)

- Production CDN hosting of EE binaries (License Server returns `artifact_uri` only)
- Marketplace third-party bundles
- Automated CI signing pipeline (Phase 11)
