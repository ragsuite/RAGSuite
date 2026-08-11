# Future: SSO — Backend Specification

> **⚠️ Google OIDC IMPLEMENTED** — OIDC login + `/org/sso` config are shipped.  
> **Use instead:** [organization-and-sso.md](../organization-and-sso.md) · [api-reference.md](../api-reference.md#sso-routesauth_ssopy--authsso)  
> **Still planned:** SAML 2.0, SCIM (below)

**Status:** Google OIDC **shipped**; SAML/SCIM planned  
**Depends on:** Organization tables (shipped)  
**Last updated:** 2026-07-07

---

## Goals (backend)

1. OIDC authorization-code login issuing same JWT + `UserSession` as password auth
2. Per-organization IdP configuration in PostgreSQL
3. Optional JIT member provisioning (never default `org_admin`)
4. SAML 2.0 SP (phase 2)
5. Domain discovery by email

**Reuse from connectors:** `encrypt_secret`, Redis OAuth state, callback HTML pattern — **separate routes** from connector OAuth.

---

## New tables

### `organization_sso_configs`

```sql
CREATE TABLE organization_sso_configs (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  protocol VARCHAR(10) NOT NULL DEFAULT 'oidc',  -- oidc | saml
  enabled BOOLEAN NOT NULL DEFAULT false,
  idp_entity_id VARCHAR(512),
  client_id VARCHAR(512),
  client_secret_encrypted TEXT,
  authorization_url VARCHAR(1024),
  token_url VARCHAR(1024),
  jwks_uri VARCHAR(1024),
  saml_metadata_xml TEXT,
  sp_entity_id VARCHAR(512),
  acs_url VARCHAR(1024),
  email_domains JSONB NOT NULL DEFAULT '[]',
  jit_provisioning_enabled BOOLEAN NOT NULL DEFAULT false,
  default_role VARCHAR(20) NOT NULL DEFAULT 'member',
  group_role_mapping JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### `user_idp_identities`

```sql
CREATE TABLE user_idp_identities (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idp_subject VARCHAR(512) NOT NULL,
  protocol VARCHAR(10) NOT NULL,
  email_at_link VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, idp_subject, protocol)
);
```

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SSO_ENABLED` | `false` | Global kill switch |
| `SSO_CALLBACK_BASE_URL` | `FRONTEND_BASE_URL` or API base | Redirect base |
| `SSO_REQUIRE_REDIS` | `true` in prod multi-worker | Fail closed without Redis for state |

---

## API routes — `routes/auth_sso.py`

### Public (login flow)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/sso/discover` | `?email=user@acme.com` → `{ org_slug, sso_enabled, protocol }` |
| GET | `/auth/sso/start` | `?org_slug=acme` or `?email=` → 302 redirect to IdP |
| GET | `/auth/sso/callback` | OIDC callback `?code=&state=` → issue session, redirect to SPA |
| POST | `/auth/sso/saml/acs` | SAML Assertion Consumer Service |
| GET | `/auth/sso/metadata` | SP metadata XML for IdP setup |

**Note:** Uses `/api/v1/auth/sso/*` — **distinct from** `/api/v1/crawl/auth/*` (password login remains).

### Org admin (SSO config)

**Prefix:** `/api/v1/org/sso`  
**Auth:** `require_org_admin`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/org/sso` | Get SSO config (secrets masked) |
| PUT | `/org/sso` | Create/update SSO config |
| POST | `/org/sso/test` | Validate IdP connectivity |
| DELETE | `/org/sso` | Disable SSO |

**PUT `/org/sso` request (OIDC):**
```json
{
  "enabled": true,
  "protocol": "oidc",
  "client_id": "...",
  "client_secret": "...",
  "authorization_url": "https://...",
  "token_url": "https://...",
  "jwks_uri": "https://...",
  "email_domains": ["acme.com"],
  "jit_provisioning_enabled": false,
  "default_role": "member"
}
```

**GET response:** same fields; `client_secret` → `"********"` or omitted.

---

## OIDC flow (backend detail)

```text
GET /auth/sso/start?org_slug=acme
  1. Load organization_sso_configs where enabled
  2. Generate state + nonce → Redis key sso:state:{uuid} TTL 600s
  3. Build authorize URL (PKCE code_challenge)
  4. 302 redirect

GET /auth/sso/callback?code=...&state=...
  1. Validate state from Redis (delete key)
  2. Exchange code at token_url (client_secret)
  3. Validate id_token: iss, aud, exp, nonce
  4. Extract sub, email, name, groups
  5. resolve_user(org_id, sub, email):
       a. Find user_idp_identities by (org_id, sub)
       b. Else find user by email in org
       c. Else if jit_provisioning_enabled: create user + organization_members(member)
       d. Else 403 "Account not provisioned"
  6. Never assign org_admin via JIT
  7. create_access_token + UserSession (same as password login)
  8. Set httpOnly cookie
  9. Redirect to FRONTEND_BASE_URL/login/callback?success=1 or postMessage HTML
```

---

## JIT policy

| `jit_provisioning_enabled` | Behavior |
|----------------------------|----------|
| `false` | User must exist (admin-created) with matching email |
| `true` | Create `User` + `organization_members` role=`default_role` (always `member`) |

After JIT: no project assignments — admin assigns via `/org/users/{id}/projects`.

---

## SAML flow (phase 2)

```text
GET /auth/sso/start?org_slug=acme&protocol=saml
  → Generate AuthnRequest, redirect to IdP SSO URL

POST /auth/sso/saml/acs
  → Validate SAMLResponse signature, audience, conditions
  → Map NameID + attributes → same resolve_user() as OIDC
  → Issue JWT + session
```

**Library:** `python3-saml` or equivalent; store IdP cert from `saml_metadata_xml`.

---

## Integration with password auth

| Scenario | Behavior |
|----------|----------|
| SSO enabled, user has password | Password login still works (break-glass) unless org enforces SSO-only (future flag) |
| SSO user, `auth_provider=sso` | Optional: block password login |
| 2FA | If IdP handles MFA, skip RAGSuite 2FA on SSO login (config flag future) |

---

## Security requirements

- PKCE required for OIDC
- State single-use in Redis
- Redirect URI allowlist: `{SSO_CALLBACK_BASE_URL}/api/v1/auth/sso/callback`
- No open redirects on final SPA redirect
- Audit: `auth.sso.login`, `auth.sso.jit_provision`, `auth.sso.failure`
- Generic error messages (no account enumeration)

---

## Service modules

```
app/services/sso/
  ├── oidc.py       # authorize URL, token exchange, id_token validation
  ├── saml.py       # AuthnRequest, ACS validation
  ├── resolve_user.py  # JIT + identity linking
  └── state.py      # Redis state/nonce
```

---

## Frontend contract (for alignment)

| UI element | Backend expectation |
|------------|---------------------|
| "Sign in with SSO" button | `GET /auth/sso/discover?email=` then redirect to `/auth/sso/start` |
| Email-first login | Discover returns `sso_enabled: true` → show SSO button only |
| No signup link | `public-config.registration_enabled: false` |
| SSO callback page | Handle redirect from `/auth/sso/callback` with cookie set; call `GET /crawl/auth/verify` |
| Org admin SSO settings | `GET/PUT /org/sso`, `POST /org/sso/test` |

**Do not implement frontend until backend OIDC phase 1 is deployed and tested.**

---

## Tests checklist

- [ ] OIDC happy path with mock IdP
- [ ] Invalid state rejected
- [ ] JIT off: unknown email → 403
- [ ] JIT on: user created as member, no projects
- [ ] Identity link on second login (same sub)
- [ ] Deactivated user cannot SSO
- [ ] Org admin can CRUD SSO config
- [ ] Redis required when `SSO_REQUIRE_REDIS=true`

---

## Files to create/modify

| File | Action |
|------|--------|
| `alembic/versions/*_sso.py` | Migration |
| `models.py` | SSO models |
| `schemas.py` | SSO DTOs |
| `routes/auth_sso.py` | Public SSO routes |
| `routes/organization.py` | Add `/org/sso` endpoints |
| `services/sso/*` | OIDC/SAML logic |
| `settings.py` | SSO env vars |
| `main.py` | Register auth_sso router |
| `tests/test_sso.py` | Tests |
