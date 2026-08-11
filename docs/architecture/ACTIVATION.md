# Activation & Updates (Phase 10+)

## CE never needs activate

Community Edition boots with `npm start` / `ragsuite start` with **no** license file.  
`entitlements_allow()` allows `edition: community|platform` modules always.

## Customer Enterprise (current: email pack)

Vendor emails **two files** from Ops → License detail (**Email pack**). The email is **minimal**: attachments + paste paths + link to the npm CLI docs. It is auto-generated — customers contact `sales@ragsuite.de` (do not reply to the message).

| Attachment | Paste into install root (default `~/ragsuite`) |
|------------|------------------------------------------------------|
| `offline.key` | `<install>/.ragsuite/license/offline.key` |
| `ragsuite-ee-<version>.tar.gz` | `<install>/ragsuite-ee-<version>.tar.gz` |

Do **not** unpack the tar. Do not hand-edit the key.  
Full setup/activate commands: [npm `@ragsuite/ragsuite`](https://www.npmjs.com/package/@ragsuite/ragsuite) (source of truth: `cli/README.md` Enterprise section).

After both files are in place (first-time Enterprise):

```bash
ragsuite activate \
  --key "<install>/.ragsuite/license/offline.key" \
  --bundle "<install>/ragsuite-ee-<version>.tar.gz" \
  --restart
```

What happens:

1. CLI validates the key + signed tar (paths above — already pasted by the customer)
2. Tar installs under `<install>/extensions/installed/ee/<version>/` and becomes ACTIVE
3. Any previous EE version dirs under that same install are removed (code replace only)
4. **DB / `.env` are never wiped**

### EE upgrade later (same license key)

Email a **new tar only**. Customer keeps `offline.key`, replaces the tar at `<install>/ragsuite-ee-<new>.tar.gz`, then:

```bash
ragsuite update --bundle "<install>/ragsuite-ee-<new>.tar.gz" --restart
```

CE pulls via git; before EE install the CLI **verifies offline.key locally** (`valid`/`grace` only).  
**Expired / absent / invalid key → EE tar install refused** (CE update still applied).  
Editing `valid_to` in the key breaks the Ed25519 signature — customers cannot extend expiry.  
EE code is replaced under `extensions/installed/ee/`; **DB / `.env` / key are never wiped.**

### Renew expired key

Email a **new offline.key**. Customer pastes over `<install>/.ragsuite/license/offline.key` (must already have activated once):

```bash
ragsuite update --key "<install>/.ragsuite/license/offline.key" --restart
```

Auto-replaces when installed key is expired/invalid. Still-valid key needs `--force`.  
`update --key` / `update --bundle` **cannot** first-time activate — that is `activate` only.

### Key protection

- Replacing a **different** key requires `--force`
- `ragsuite license clear` requires `--force`
- Do not hand-edit claims; use a vendor-signed renewed key if dates change

## Claims (offline key)

Issued keys contain only:

`schema`, `license_id`, `customer_id`, `seats`, `entitlements`, `valid_from`, `valid_to`, `grace_days`

No License Server / ngrok / discovery URLs. Validation on the customer PC is offline (packaged public key only).

## Update (CE only, or CE + emailed EE)

```bash
ragsuite update --restart
ragsuite update --bundle "<install>/ragsuite-ee-<ver>.tar.gz" --restart
```

Never wipes DB / `.env` / `offline.key`.  
Expired key → CE update OK; **`update --bundle` refuses EE**. Runtime also keeps EE modules gated off (data kept).

## Offline key path

```text
<install>/.ragsuite/license/offline.key
```

Override: `RAGSUITE_LICENSE_FILE`.

## Entitlement match

| License state | CE modules | EE modules |
|---------------|------------|------------|
| absent / invalid | load | skip |
| valid / grace | load | load if entitled |
| expired past grace | load | skip (data kept) |

## Vendor (License Ops)

1. Publish EE **GitHub Release** with asset `ragsuite-ee-*.tar.gz` (`release-bundle.yml` on private `RAGSUITE-EE` — tags alone are not enough) → License **Bundles → Sync from GitHub** (or local catalog register for DX)
2. Create customer + license → **Email pack** (`offline.key` + latest EE tar)
3. Email body: paste paths only + npm docs link; contact `sales@ragsuite.de`
4. Later EE bump → email **new tar only** (same key)
5. Key expired → email **new offline.key**

Machines / fingerprints are not required for the air-gap email pack.

## Related

- [ADR-005-licensing.md](./ADR-005-licensing.md)  
- [BUNDLES.md](./BUNDLES.md)  
- [CICD.md](./CICD.md) (EE release vs tag)  
- CLI: `cli/README.md` · License runbook: `/Users/arun/RAGSUITE_License/docs/FULFILLMENT-RUNBOOK.md`
