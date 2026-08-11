# RELEASE-STRATEGY

## Goals

- Public Community Edition is a complete product (Apache License 2.0).
- Enterprise capabilities ship as entitled **Bundles**, not private git access.
- License Server releases independently and never embeds RAG pipelines.

## Release trains

| Artifact | Repo | Audience | Cadence (intent) |
|----------|------|----------|------------------|
| Platform + CE modules + CLI | `RAGSUITE` (public) | Everyone | Tagged SemVer releases (ADR-004) |
| EE Bundles (compiled) | Built from `RAGSUITE_EE` | Paying / entitled customers | Aligned to Platform compat ranges |
| License Server | `RAGSUITE_License` | Ops / NITSAN | Independent; API versioned |

## Channels

1. **Public CE** — source + container images / CLI npm package from Community CI (Phase 11).
2. **EE Bundles** — private build → checksum/signature → License Server artifact authorization (Phases 7–8, 11).
3. **Offline key** — issued by License Server; customer applies via CLI `license` / `activate` (Phases 8–10).

## Upgrade path (product)

```text
Community install
  → purchase / partner license
  → receive offline key (+ optional bundle download auth)
  → CLI license / activate / bundle
  → restart
  → Platform loads entitled EE Extensions
```

No re-platforming. No phone-home for daily verify (ADR-005).

## Compatibility gates

- Bundle `platformCompat` must match installed Platform (ADR-004 / ADR-006).
- CLI `doctor` reports Platform / CLI / bundle mismatches (ADR-008).
- Breaking Platform MAJOR requires new EE Bundle train.

## What is not released

- `RAGSUITE_EE` source tree (private)
- Signing private keys
- License Server customer data

## Phase alignment

| Phase | Release-related work |
|------:|----------------------|
| 0 | This document (freeze) |
| 7 | Bundle format & build |
| 8 | License Server issuance & download auth |
| 9–10 | CLI activate / license / bundle / update |
| 11 | CI/CD for CE, EE bundles, License |
| 12 | Customer portal for self-serve pieces |
| 15 | Production public CE + EE commercial readiness |

## DX during development

Internal developers use path attach (`RAGSUITE_EE_ROOT`), not customer bundles, until Phase 7 artifacts exist. Same `npm start` from CE root.
