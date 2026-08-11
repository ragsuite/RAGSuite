# ADR-006 — Bundles

## Status

Accepted (Phase 0 freeze)

## Context

Customers must receive Enterprise capabilities without access to the private `RAGSUITE_EE` git tree.

## Decision

Enterprise modules are delivered as **Bundles**: compiled / packaged Extensions plus metadata.

### Bundle contents (logical)

| Part | Purpose |
|------|---------|
| Module artifacts | Compiled backend + frontend Extension entrypoints |
| Manifest | Bundle id, version, contained module ids/versions, `platformCompat`, entitlement keys required |
| Checksum | Integrity hash (e.g. SHA-256) over payload |
| Signature | Optional/required code signature verified before load (Phase 7 / security workstream) |

Customers never need the private EE source repo.

### Lifecycle

```text
Build (private CI) → sign + checksum → publish to License Server artifact store
  → customer authorized download (activation / portal)
  → CLI activate / bundle install
  → Platform discovers under extensions/
  → entitlement check → register
```

### Development vs customer

| Mode | Source of EE modules |
|------|----------------------|
| Internal DX (Phase 6) | Workspace path attach (`RAGSUITE_EE_ROOT`) — source Extensions |
| Customer | Compiled Bundle only |

Same Extension contract either way (ADR-003).

### Non-goals for this ADR

- Exact compile toolchain (Phase 7)
- Marketplace third-party bundles (future; same Extension shape)

## Consequences

- `RAGSUITE_EE` is never npm-published as an installer.
- Zero duplicated module source between CE and EE trees (ADR-007).
