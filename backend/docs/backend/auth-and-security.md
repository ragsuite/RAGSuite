# Auth & Security

**Source:** `app/auth.py`, `app/routes/crawl.py`, `app/routes/auth_sso.py`, `app/security_utils.py`  
**Last updated:** 2026-08-06  
**Org + SSO:** [organization-and-sso.md](./organization-and-sso.md)

---

## Authentication modes

| Mode | Used by | Mechanism |
|------|---------|-----------|
| **Session JWT** | Admin clients | Bearer header (**frontend (Server workspace)**) or `access_token` httpOnly cookie (**legacy Vite SPA**) — both supported |
| **API key** | Mobile SDK (RN / Flutter), automation | Bearer `rgs_live_*` / `rgs_test_*` — project scoped via `api_key.project_id` |
| **Widget embed** | Web HTML chat/search widgets | `X-Widget-Token` and/or `X-Project-ID` + domain allowlist — **not** API keys |
| **Content token** | Document stream | Short-lived query `?token=` |

---

## JWT + session flow

```text
POST /crawl/auth/login
  → authenticate_user (bcrypt)
  → optional 2FA branch (temp_token)
  → create_access_token with unique jti
  → insert UserSession (token_jti, expires_at, device info)
  → set cookie + return access_token in body

Protected request
  → extract Bearer or cookie
  → verify_token → username, payload
  → lookup UserSession by jti; check is_active, expires_at
  → update session.last_activity
  → load User; check is_active
  → get_current_user_required: check email_verified_at
```

**Password hashing:** bcrypt (legacy SHA-256 migration path exists).

---

## Auth dependencies (`auth.py`)

| Dependency | Use when |
|------------|----------|
| `get_current_user` | Need user; no email-verify gate |
| `get_current_user_required` | **Default for admin routes** — requires verified email |
| `get_current_user_optional` | Returns None if unauthenticated |
| `get_current_admin_user` | Global `is_admin` or `organization_members.role=org_admin` |
| `get_current_org_member` | Active org membership required |
| `require_org_admin` | Org admin routes (`/org/users`, `/org/sso`, …) |
| `require_project_permission("…")` | Project ACL via `project_members` |
| `get_accessible_project_ids` | List projects user can access |
| `get_active_project` | User's active project (excludes temp onboarding) |
| `verify_api_key` | API key only |
| `get_current_user_or_api_key` | Prompt routes, search prompt |
| `get_project_id_or_user` | **Widgets** — resolves project + optional user |
| `require_email_verified` | Explicit 403 if unverified |

### Organization dependencies (implemented)

| Dependency | Use when |
|------------|----------|
| `get_current_org_member` | Any org member route (`GET /org`) |
| `require_org_admin` | User admin, SSO config, org projects |
| `require_project_permission("crawl:manage")` | Feature-gated project routes |

See [organization-and-sso.md](./organization-and-sso.md) for permission strings.

### SSO login (Google OIDC)

```text
GET /auth/sso/start → Google → GET /auth/sso/callback
  → validate id_token (iss, aud, nonce, email_verified)
  → resolve_sso_user (JIT off — must exist in DB)
  → never modify organization_members.role
  → same UserSession + JWT cookie as password login
```

State/nonce/PKCE stored in Redis when available (`SSO_REQUIRE_REDIS`).

---

## Widget authentication (`get_project_id_or_user`)

Priority order:

1. **`X-Widget-Token`** — HMAC embed token (`verify_embed_token`)
2. **Bearer JWT or API key** — standard auth + project from key or active project
3. **`X-Project-ID`** + **`validate_domain_for_project`** — domain must be in `IntegrationEmbed.keys`

Headers set by frontend/widgets:

```
X-Project-ID: <uuid>
X-Widget-Mode: true
X-Widget-Token: <optional embed secret>
X-Request-Domain: <host>
X-Request-Url: <full page url>
```

---

## API keys

- Prefix: `rgs_live_` (production) or `rgs_test_` (test)
- Stored hashed in `api_keys.key_hash`
- Scoped to `project_id` — settings and chat/search routes resolve project from the key, not the creator's active project
- Checked: active, not expired, rate limits
- Used via `Authorization: Bearer <key>`
- **Mobile SDK:** Bearer only — do not send `X-Widget-Token` or `X-Widget-Mode` with API keys

---

## Two-factor authentication

| Type | Login flow | Profile setup |
|------|------------|---------------|
| TOTP | `requires_2fa` + `temp_token` → `/login/verify-2fa` | `/user/2fa/setup`, `/verify`, `/disable` |
| Email 2FA | Same verify endpoint | `/user/2fa/email/enable`, `/disable` |
| Backup codes | Verify endpoint | `/user/2fa/backup-codes` |

---

## Email verification

- Gate on `get_current_user_required` unless `DISABLE_EMAIL_VERIFICATION=true`
- Tokens in `email_verification_tokens`
- Endpoints: `/crawl/auth/verify-email`, `/resend-verification`

---

## Registration control

| Setting | Effect |
|---------|--------|
| `ALLOW_PUBLIC_REGISTRATION=true` | `POST /crawl/auth/register` allowed; `public-config` returns `registration_enabled: true` |
| `ALLOW_PUBLIC_REGISTRATION=false` | Register returns 403 |

**Future:** Org admin-only user creation — [future/organization.md](./future/organization.md)

---

## OAuth (connectors & integrations)

- State/nonce: signed with `OAUTH_STATE_SECRET`, TTL `OAUTH_STATE_TTL_SECONDS`
- Redis preferred for multi-worker OAuth state
- Tokens encrypted: `security_utils.encrypt_secret` / `safe_decrypt_secret`
- Callbacks return HTML with `postMessage` to opener (restrict origin in production)

**Not the same as user SSO** — connector OAuth authorizes external apps; user SSO is planned in [future/sso.md](./future/sso.md).

---

## Production startup guards (`main.py` lifespan)

- Reject default/weak `JWT_SECRET_KEY`
- Reject wildcard CORS when `DEBUG=false`
- Require `CUSTOM_LLM_INTERNAL_API_KEY`
- `WEB_CONCURRENCY>1` requires Redis + `CHROMA_MODE=http`

---

## Audit & logging

- `audit_service` records security events (`auth.login`, `auth.register`, …)
- Login logs redact credentials
- IP from `get_real_ip` (trusts `X-Forwarded-For` from localhost proxies only)

---

## Rate limiting

- `slowapi` on selected routes (e.g. `/retrieve` 60/min)
- Connector manual sync: `assert_connector_rate_limit` in `framework.py`
- Login/register: rate limits in `crawl.py` routes
