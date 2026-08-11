# ADR-003 — Extensions

## Status

Accepted (Phase 0 freeze)

## Context

Platform must load Community modules and Enterprise modules (and later marketplace plugins) through one mechanism so edition brands do not leak into the loader.

## Decision

An **Extension** is what Platform loads. A Module (CE or EE) is packaged and discovered as an Extension.

### Scan paths

On start, Platform scans (order may be refined in Phase 4; both are required):

1. `modules/` — Community modules shipped with CE (and local EE attach in development)
2. `extensions/` — installed / attached Extensions (including activated EE bundles and future marketplace plugins)

Development attach of `RAGSUITE_EE` (ADR-007) makes Enterprise modules appear on these scan paths without git submodules.

### Load / register contract

```text
Platform boot
  → discover Extension manifests on scan paths
  → validate manifest (id, version, surfaces, declared permissions, platform compatibility)
  → for EE: check entitlements (ADR-005) before enable
  → load backend + frontend entrypoints
  → register: routes · navigation · permissions · migrations · seeders · settings · APIs
  → ready
```

Platform records loaded Extensions for CLI `status` / `extensions` / `plugins` (ADR-008).

### Edition-agnostic loader

Platform **must not** branch on:

- “Community” vs “Enterprise” vs “Marketplace” brand names
- Presence of `RAGSUITE_EE` git folder as a security gate

Platform **may** branch on:

- Manifest validity
- Declared entitlement keys (opaque strings from license)
- Version compatibility (ADR-004)

CE and EE modules look the same to the loader.

### Failure policy (frozen intent)

- Missing optional Extension → CE continues.
- Invalid Extension → skip + log; do not crash CE boot unless it is a required Platform contract failure.
- Entitlement denied → Extension not registered; teaser/locked UX may remain CE-side where pricing already shows a locked teaser (e.g. Compare Models).

Exact error codes land in Phase 4 / 10.

## Consequences

- No duplicate loaders for CE vs EE.
- Repo split (Phase 5) and bundles (Phase 7) only change *where* Extensions come from, not *how* they load.
