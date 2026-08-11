# SSO (Single Sign-On) — Design & Implementation Plan

**Status:** **Google OIDC shipped**; SAML/SCIM planned  
**Last updated:** 2026-07-07  
**Implementation reference:** [../backend/organization-and-sso.md](../backend/organization-and-sso.md)  
**Depends on:** [organization-architecture.md](./organization-architecture.md) (org model, login-only UX)  
**Related:** [README.md](./README.md)  
**Code layout:** `app/` at repo root (standalone backend)

---

## Executive summary

RAGSuite will support **enterprise SSO** so organization members log in with their corporate identity provider (IdP) instead of (or in addition to) local passwords. SSO integrates with the **organization architecture**: users do not self-register; SSO can **provision (JIT)** or **match existing** admin-created accounts.

**Initial protocols (recommended order):**

1. **OIDC / OAuth 2.0** (Google Workspace, Microsoft Entra ID, Okta, Auth0, etc.)
2. **SAML 2.0** (enterprise customers requiring SAML)

---

## Goals

| Goal | Description |
|------|-------------|
| **Federated login** | “Sign in with your organization” from login page |
| **No signup via SSO** | SSO authenticates; account must exist or be JIT-created per org policy |
| **Org-scoped config** | Each organization stores its own IdP metadata (or uses platform-level template) |
| **Session compatibility** | Same JWT + `UserSession` model as password login |
| **Admin control** | Org admin enables SSO, uploads/metadata, maps groups → roles (phase 2) |

---

## Current state

| Area | Today |
|------|--------|
| Primary auth | Username/password + JWT (`POST /api/v1/crawl/auth/login`) |
| Google OIDC SSO | **Implemented** — `GET /api/v1/auth/sso/*` + `PUT /api/v1/org/sso` |
| 2FA | TOTP and email 2FA on password login (skipped for SSO) |
| OAuth in product | Connectors (Drive, Notion, Gmail) — separate from user SSO |
| Registration | Disabled by default (`ALLOW_PUBLIC_REGISTRATION=false`) |

---

## Architecture overview

```text
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│  RAGSuite API    │────▶│     IdP     │
│  Login page │     │  /auth/sso/*     │     │ OIDC/SAML   │
└─────────────┘     └────────┬─────────┘     └─────────────┘
                             │
                    ┌────────▼─────────┐
                    │  PostgreSQL      │
                    │  sso_configs     │
                    │  users / org     │
                    └──────────────────┘
```

### Flow (OIDC — authorization code)

```text
1. User clicks "Sign in with SSO" (optional email domain hint)
2. GET /api/v1/auth/sso/start?org_slug=acme
3. Redirect to IdP authorize URL (state + nonce in Redis)
4. IdP redirects to GET /api/v1/auth/sso/callback?code=...&state=...
5. Exchange code for tokens; validate id_token (iss, aud, exp, nonce)
6. Map claims → user (email, sub, groups)
7. JIT create OR link existing user; enforce org membership
8. Issue RAGSuite JWT + UserSession (same as password login)
9. Redirect to app with tokens (secure cookie or postMessage for SPA)
```

### Flow (SAML — SP-initiated)

```text
1. User enters email or selects org → SP generates AuthnRequest
2. Redirect to IdP SSO URL
3. IdP POSTs SAMLResponse to /api/v1/auth/sso/saml/acs
4. Validate signature, audience, conditions, InResponseTo
5. Map NameID / attributes → user; steps 7–9 as OIDC
```

---

## Data model (proposed)

### `organization_sso_configs`

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `org_id` | FK → organizations |
| `protocol` | `oidc` \| `saml` |
| `enabled` | Boolean |
| `idp_entity_id` | Issuer / entity ID |
| `client_id` | OIDC client id (encrypted if needed) |
| `client_secret_encrypted` | OIDC secret |
| `authorization_url`, `token_url`, `jwks_uri` | OIDC endpoints |
| `saml_metadata_xml` | IdP metadata (or URL to fetch) |
| `sp_entity_id`, `acs_url` | SP configuration |
| `email_domains` | JSON — e.g. `["acme.com"]` for domain routing |
| `jit_provisioning_enabled` | Auto-create member on first SSO login |
| `default_role` | `member` (never `org_admin` via JIT default) |
| `group_role_mapping` | JSON — IdP group → role/permissions (phase 2) |
| `created_at`, `updated_at` | |

### `user_idp_identities` (new)

| Column | Purpose |
|--------|---------|
| `user_id` | FK → users |
| `org_id` | FK → organizations |
| `idp_subject` | Stable IdP `sub` or NameID |
| `protocol` | `oidc` \| `saml` |
| `email_at_link` | Email when linked |

Unique: `(org_id, idp_subject, protocol)`.

---

## JIT provisioning policy

Align with [organization-architecture.md](./organization-architecture.md):

| Policy | Behavior |
|--------|----------|
| **JIT off** | SSO login only succeeds if admin already created user with matching email |
| **JIT on** | First SSO login creates `member` in org; admin assigns projects afterward |
| **JIT + default project** | Optional: assign new SSO users to a default project with read-only chat |
| **Never JIT org_admin** | Admin role only via bootstrap or explicit admin promotion |

---

## Login UX (target)

### Login page

- Email/password (hidden when org enforces SSO-only)
- **Continue with SSO** — domain discovery: user enters work email → resolve org by `email_domains`
- Org slug in URL for white-label: `app.example.com/login?org=acme`
- No signup link

### Org admin — SSO settings

- Enable/disable SSO
- OIDC: client id/secret, discovery URL or manual endpoints
- SAML: upload metadata XML or paste URLs
- Test connection button
- JIT toggle + default role
- (Phase 2) Group mapping table

---

## API endpoints (proposed)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `GET` | `/api/v1/auth/sso/start` | Public | Begin OIDC/SAML flow |
| `GET` | `/api/v1/auth/sso/callback` | Public | OIDC callback |
| `POST` | `/api/v1/auth/sso/saml/acs` | Public | SAML assertion consumer |
| `GET` | `/api/v1/auth/sso/metadata` | Public | SP metadata for IdP setup |
| `GET` | `/api/v1/org/sso` | Org admin | Get SSO config |
| `PUT` | `/api/v1/org/sso` | Org admin | Update SSO config |
| `POST` | `/api/v1/org/sso/test` | Org admin | Validate IdP connectivity |

Existing password login remains for break-glass admin and orgs without SSO.

---

## Security requirements

| Requirement | Notes |
|-------------|--------|
| **State + nonce** | Redis-backed; fail closed if Redis unavailable in multi-worker prod |
| **PKCE** | Required for OIDC public clients |
| **Token validation** | iss, aud, exp, nonce; clock skew tolerance |
| **SAML signature** | Verify with IdP cert from metadata; reject unsigned assertions |
| **Redirect URI allowlist** | Per-org registered callbacks only |
| **No account enumeration** | Generic errors on login failure |
| **2FA interaction** | Policy: SSO satisfies MFA at IdP, or require step-up for sensitive actions |
| **Session binding** | Same `UserSession` revocation as password auth |
| **Audit** | `auth.sso.login`, `auth.sso.jit_provision`, `auth.sso.failure` |

Reuse patterns from connector OAuth:

- `security_utils.encrypt_secret` for client secrets
- Origin-safe redirects (no open redirects)
- `block_ssrf` if fetching remote SAML metadata URLs

---

## Implementation phases

| Phase | Scope | Effort (est.) |
|-------|--------|----------------|
| **S1** | OIDC login for single org; env-based config | 1–2 weeks |
| **S2** | Per-org SSO config in DB + admin UI | 1–2 weeks |
| **S3** | JIT provisioning + identity linking | 1 week |
| **S4** | SAML SP + metadata endpoints | 2–3 weeks |
| **S5** | Group → role mapping; SCIM (enterprise) | 3+ weeks |

---

## Enterprise backlog (execution order)

Status legend: `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`.

| Priority | Work item | Status | Notes |
|----------|-----------|--------|-------|
| P1 | SAML SP (`/auth/sso/saml/acs` + metadata endpoint) | READY | Required for enterprise IdPs that cannot use OIDC. |
| P1 | SCIM user/group provisioning baseline | READY | Initial target: provision/deprovision users + basic role mapping. |
| P1 | JIT provisioning enablement (currently hardcoded off) | READY | Respect org setting instead of forcing `False`; keep `org_admin` disallowed. |
| P1 | SSO-only org mode (disable password login for member accounts) | READY | Keep break-glass admin path. |
| P2 | Group-to-role mapping policy UI + backend enforcement | READY | Map IdP groups to org/project permissions. |
| P2 | Audit and operational runbook for IdP incidents | READY | Add rotation/failover procedures and troubleshooting flow. |

### Definition of done for this backlog

- Security checks from this document remain enforced (state/nonce/PKCE/signature/allowlist).
- No public registration path is introduced.
- Existing password login remains available for break-glass admin recovery unless org policy explicitly enforces SSO-only.
- Tests cover org-admin bootstrap, pre-provisioned members, deactivated members, and SSO failure fallback.

---

## SCIM (future, enterprise)

Documented for roadmap; not in initial SSO release.

- `POST /scim/v2/Users` — provision users from IdP
- Group sync → `project_members` or org roles
- Complements SSO; preferred by large IT teams

See [product/ragsuite-feature-sop-and-business-material.md](../product/ragsuite-feature-sop-and-business-material.md) enterprise priority list.

---

## Configuration (environment)

| Variable | Purpose |
|----------|---------|
| `SSO_ENABLED` | Global kill switch |
| `SSO_DEFAULT_ORG_SLUG` | Single-tenant default org for SSO |
| `SSO_CALLBACK_BASE_URL` | e.g. `https://app.example.com` |
| `SSO_REQUIRE_REDIS` | Fail SSO start if no Redis (multi-worker) |

Per-org settings stored in `organization_sso_configs` override env for multi-tenant.

---

## Testing checklist

- [ ] OIDC login with Google Workspace test app
- [ ] OIDC login with Microsoft Entra ID
- [ ] SAML login with Okta / Azure AD SAML app
- [ ] JIT off: unknown user rejected
- [ ] JIT on: user created as member, no project access until assigned
- [ ] Deactivated user cannot SSO login
- [ ] Session revoke works after SSO login
- [ ] Callback CSRF (invalid state rejected)
- [ ] Multi-worker: nonce in Redis, not in-memory only

---

## Files to touch (implementation reference)

| Layer | Files |
|-------|--------|
| Routes | `app/routes/auth_sso.py` (new) |
| Service | `app/services/sso/oidc.py`, `saml.py` |
| Models | `app/models.py` |
| Frontend | Monorepo `frontend/client/src/pages/Login.tsx`, `OrgSsoSettings.tsx` (external) |
| Settings | `app/settings.py` |

---

## Related documentation

- [Organization architecture](./organization-architecture.md)
- [Architecture](../architecture.md)
- [Future implementations](./README.md)
