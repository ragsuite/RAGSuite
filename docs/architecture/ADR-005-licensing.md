# ADR-005 — Licensing

## Status

Accepted (Phase 0 freeze)

## Context

Enterprise is sold per seat. Upgrades must work offline for sovereign / air-gapped deployments. The License Server must not embed RAG business logic.

## Decision

### Offline license key

- Upgrade path: apply a **signed offline license key** carrying seat count and entitlement set.
- The RAGSuite app **verifies the signature locally** (public key embedded or provisioned with Platform).
- **No phone-home** required to validate day-to-day use.
- Community Edition requires no key.

### Entitlements

- License payload lists entitlement keys (opaque strings), e.g. `sso`, `organization`, `audit_full`, `compliance`, `compare_models`, `query_tracing`, `analytics`, `mobile_beta`.
- Extension enablement checks entitlements (ADR-003), not UI edition badges.
- Cosmetic `getProductEdition()` (or equivalent) is **never** a security gate.

### Seats & machines

| Concept | Owner | Role |
|---------|-------|------|
| Seats | License payload + License Server | Max concurrent named/active users per agreement |
| Machines | License Server (activation records) | Where downloads/activations were authorized |
| Activations | License Server + local marker | Bind key/install for support & download auth |

Seat enforcement UX and hard limits are productized in later phases; crypto and server land Phase 8 / 10.

### Expired / grace

| State | Behavior (intent) |
|-------|-------------------|
| Valid | Entitled EE Extensions load |
| Grace | After expiry, configurable grace window: EE remains loaded with admin warnings |
| Expired (past grace) | EE Extensions unload / stay disabled; CE continues; data retained |
| Invalid signature | Treat as no EE license; log clearly |

Exact durations and admin messaging: Phase 10 / 12.

### License Server boundary

**Does:** customers, licenses, subscriptions, machines, activations, compatibility metadata, **bundle download authorization**, issuance of signed offline keys.

**Does not:** crawl/chat/search, CE/EE module source, RAG pipelines, Platform runtime.

Ports must not collide with app ports `9090` / `9191` / `9091` / `5436` / `6382` / `8004`.

## Consequences

- Public CE never ships EE secrets or private signing keys.
- Air-gapped customers can run EE after one-time key install (and optional offline bundle install).
