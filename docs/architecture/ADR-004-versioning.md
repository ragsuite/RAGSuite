# ADR-004 — Versioning

## Status

Accepted (Phase 0 freeze)

## Context

Platform, Community modules, Enterprise bundles, and the CLI evolve at different cadences. Customers must know compatibility without phone-home.

## Decision

### Versioned artifacts

| Artifact | Version scheme | Published from |
|----------|----------------|----------------|
| Platform + CE release | SemVer (`MAJOR.MINOR.PATCH`) | Public CE repo |
| Community modules | SemVer; may track Platform release train | Public CE repo |
| Enterprise Bundle | SemVer + manifest `platformCompat` range | Private EE build (Phase 7) |
| CLI (`@ragsuite/ragsuite` today; name may evolve) | SemVer | Public CE repo only |
| License Server API | SemVer / API version header | `RAGSUITE_License` |

### Compatibility rules

1. **Platform MAJOR** may break Extension manifests and Shared contracts.
2. **Platform MINOR** adds contracts; existing Extensions remain loadable.
3. **Bundle** declares `platformCompat` (e.g. `>=1.4.0 <2.0.0`). Loader refuses incompatible bundles.
4. **CLI** is versioned independently but documents supported Platform ranges; `doctor` reports mismatches.
5. **License key** includes issued-at / expires / seat / entitlement set; not tied 1:1 to Platform patch.

### Module version inside a release

- CE modules shipped with a Platform release share that release’s changelog; individual module versions appear in manifests for Extension identity.
- EE modules version inside the Bundle manifest; customers do not pull private git tags.

### Pre-1.0

Until public CE 1.0 (Phase 15), versions may use `0.x` with the same SemVer meaning; breaking changes still bump MINOR under `0.x` only when explicitly documented in release notes.

## Consequences

- Phase 7 bundles and Phase 10 activation must enforce `platformCompat`.
- Phase 11 CI publishes CE and EE artifacts with distinct pipelines.
