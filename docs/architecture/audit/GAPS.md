# Gaps — incomplete EE product / remaining debt

Items required by pricing or ADR-002 that are **missing**, **partial**, or only **cosmetic**.

**Updated Phase 15:** Platform loader, offline license, CLI activate/bundle, EE tree, and License Server **shipped**. Rows below are product/roadmap follow-ups — disclose in release notes; do not block CE loop.

## Enterprise product gaps

| gap | related module id | severity | notes |
|-----|-------------------|----------|-------|
| SAML provider | `sso` | high | Only Google OIDC |
| Generic OIDC beyond Google | `sso` | med | Pricing says SAML/OIDC |
| Teams entity (org → **teams** → users) | `organization` | high | Members + project ACL only |
| Audit export API (CSV/JSON) | `audit_full` | high | List/get events; export product incomplete |
| Legal hold | `compliance` | high | No tables/UI |
| Compliance export pack | `compliance` | med | Retention settings exist |
| Query tracing CSV/JSON export product | `query_tracing` | med | Trace UI / observability snippets |
| Mobile Beta **entitlement** gate | `mobile_beta` | med | Expo/UI exist; license entitlement incomplete |
| Compare Models locked teaser on CE | `compare_models` | med | Edition badge not fully gating |
| Seat enforcement | Platform + license | high | License seats field exists; app hard-cap incomplete |

## Platform / licensing — shipped (Phase 4–12)

| item | status |
|------|--------|
| Extension loader (`modules/` + `extensions/`) | **Done** (Phase 4) |
| Offline license verify + entitlements | **Done** (Phase 10) |
| CLI `activate` / `license` / `bundle` / `extensions` | **Done** (Phase 9–10) |
| `RAGSUITE_EE` module tree | **Done** (Phase 5+) |
| License Server + internal Ops console | **Done** (Phase 8 / 12) |

Residual: entitlement checks should remain the security gate (not env flags alone); keep hardening as EE routes evolve.

## By-agreement / roadmap

| gap | notes |
|-----|-------|
| White-label as sold service | Partial widget domain config |
| SCIM / SIEM / usage billing meters | No code |
| Public self-serve customer portal | Deferred; sales-led + Ops console |
| Air-gapped support process | Offline key + bundles |

## Technical debt

| item | risk | notes |
|------|------|-------|
| Monolith `models.py` / `schemas.py` | high | CE+EE schema coupled in one Alembic train |
| Password auth under crawl router | med | Coupling |
| Cosmetic `getProductEdition()` | med | Must not become security gate |
| Empty `backend/app/overlay/` remnant | low | Do not revive |

## Feeds follow-ups

Fill GAPS rows for SAML, Teams, legal hold, exports, seat hard-caps as EE/Platform product work — tracked in [TEST-MATRIX.md](../TEST-MATRIX.md) and [RELEASE-CHECKLIST-RESULT.md](../RELEASE-CHECKLIST-RESULT.md).
