# Organization & SSO — Architecture & Frontend Contract

**Status:** Implemented (backend)  
**Audience:** Frontend developers, AI agents, backend implementers  
**Last updated:** 2026-07-08  
**API catalog:** [api-reference.md](./api-reference.md) · **SPA contract:** [external-client-contract.md](./external-client-contract.md)

---

## Summary

RAGSuite uses a **single-organization-per-deployment** model:

- **Bootstrap-first auth** — first successful password or Google sign-in bootstraps org + `org_admin`.
- **Post-bootstrap login-only** — public signup stays disabled; non-admin users require an invite.
- **Org admin** manages users, project assignments, and Google SSO settings.
- **Members** see only projects they are assigned to (plus org admin sees all).
- **Password login** remains for break-glass; **Google OIDC SSO** is optional.

---

## Architecture diagram

```text
                    ┌─────────────────────────────────────┐
                    │           Organization              │
                    │  (one per deployment, slug unique)  │
                    └──────────────┬──────────────────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   organization_members      organization_sso_configs    projects
   (user + role)            (Google OIDC settings)      (org_id)
          │                        │
          │                 user_idp_identities
          │                 (Google sub ↔ user)
          │
   project_members
   (permissions per project)
```

### Role model

| Role | `organization_members.role` | Access |
|------|---------------------------|--------|
| Org admin | `org_admin` | All org users/projects, SSO config, create users |
| Member | `member` | Only assigned projects + granted permissions |

**SSO never promotes `org_admin` after bootstrap.** It can bootstrap the first admin only when no active org admin exists.

### Permission strings (`project_members.permissions`)

| Permission | Feature area |
|------------|--------------|
| `project:read` | View project |
| `project:write` | Edit project settings |
| `project:admin` | Full project control (implies others) |
| `crawl:manage` | Crawl sources |
| `documents:manage` | Uploads / documents |
| `connectors:manage` | Drive, Notion, etc. |
| `chat:use` | Chat |
| `search:use` | Search |
| `analytics:read` | Analytics |
| `api_keys:manage` | API keys |
| `widgets:manage` | Embed widgets |
| `settings:manage` | Project settings |

---

## Authentication flows (frontend)

### 1. Login page load

```http
GET /api/v1/crawl/auth/public-config
```

**Response:**
```json
{
  "registration_enabled": false,
  "sso_enabled": true,
  "organization_slug": "default"
}
```

**Frontend behavior:**

| Field | UI action |
|-------|-----------|
| `registration_enabled: false` | Hide signup / register routes |
| `sso_enabled: true` | Show “Sign in with Google” (or provider label) |
| `organization_slug` | Pass to SSO start (optional if single-tenant) |

> **Note:** `registration_enabled` is true only when `ALLOW_PUBLIC_REGISTRATION=true` **and** the org’s `registration_enabled` column is true (or before the first org admin exists). After bootstrap it defaults off until an admin opens signup.

---

### 2. Password login (unchanged)

```http
POST /api/v1/crawl/auth/login
{ "username": "...", "password": "..." }
```

Same as before: cookie `access_token` (httpOnly) + JSON body with `access_token`, `user`.  
2FA branch unchanged (`requires_2fa`, `temp_token`).

**Axios:** `withCredentials: true` — see monorepo `frontend/client/src/services/api/client.ts`.

---

### 3. Google SSO login (new)

**Step A — optional email discovery**

```http
GET /api/v1/auth/sso/discover?email=user@acme.com
```

```json
{ "org_slug": "default", "sso_enabled": true, "provider": "google" }
```

If `sso_enabled: false`, hide SSO button.

**Step B — start OAuth (browser navigation, not XHR)**

```http
GET /api/v1/auth/sso/start?org_slug=default
→ 302 redirect to Google
```

Open in same window: `window.location.href = \`${API_BASE}/auth/sso/start?org_slug=${slug}\``

**Step C — callback (server-handled)**

```http
GET /api/v1/auth/sso/callback?code=...&state=...
→ Sets access_token cookie
→ 302 redirect to {FRONTEND_BASE_URL}/login/callback?success=1
  (Expo web may also receive `#access_token=…` for Bearer hydrate; cookie alone fails cross-origin `:9090`↔`:9091`)
```

**Frontend:** Add route `/login/callback` that:

1. Reads `?success=1` or `?success=0&error=...`
2. On success: `GET /crawl/auth/verify` then redirect to dashboard
3. On failure: show generic “Sign-in failed” (no account enumeration)

**SSO does not skip cookie session** — same `UserSession` model as password login.  
**SSO skips RAGSuite 2FA** (Google handles MFA).

**JIT provisioning:** **Off** — once an admin exists, SSO allows only linked users, same-email existing users, or pending invited users.

**Invite activation:** Admin-created users are stored as inactive pending invites and become active on first access:
- Password path: `/api/v1/crawl/auth/register` with invited email sets password and activates account.
- Google path: `/api/v1/auth/sso/callback` links identity and activates pending invite.

---

### 4. Session check (unchanged)

```http
GET /api/v1/crawl/auth/verify
Cookie: access_token=...
```

---

## Org admin APIs (frontend Team / Settings)

**Auth:** All require JWT session + `require_org_admin` (org admin or legacy `is_admin`).

**Suggested TypeScript types** (add to frontend `services/api/types.ts`):

```typescript
// Roles
type OrganizationRole = 'org_admin' | 'member';

// Permissions — use same string literals as backend
type OrgProjectPermission =
  | 'project:read' | 'project:write' | 'project:admin'
  | 'crawl:manage' | 'documents:manage' | 'connectors:manage'
  | 'chat:use' | 'search:use' | 'analytics:read'
  | 'api_keys:manage' | 'widgets:manage' | 'settings:manage';

interface OrgSummary {
  id: number;
  name: string;
  slug: string;
  max_users: number;
  max_projects: number;
  registration_enabled: boolean;
  member_count: number;
  project_count: number;
}

interface OrgUser {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  role: OrganizationRole;
  created_at: string;
  last_login: string | null;
}

interface OrgSsoConfig {
  enabled: boolean;
  protocol: string;
  provider: string;
  client_id: string | null;
  client_secret_configured: boolean;
  email_domains: string[];
  callback_url: string | null;
  jit_provisioning_enabled: boolean;
  default_role: OrganizationRole;
}
```

### Endpoint map

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/org` | Org summary (any org member) |
| PUT | `/org` | Update org name/settings (admin) |
| GET | `/org/users` | List users `?is_active&role&q` |
| POST | `/org/users` | Create user + optional project assignments |
| PATCH | `/org/users/{user_id}` | Update user/role/active |
| DELETE | `/org/users/{user_id}` | Deactivate user + revoke sessions |
| GET | `/org/users/{user_id}/projects` | List project assignments |
| PUT | `/org/users/{user_id}/projects` | Replace all assignments |
| GET | `/org/projects` | List org projects |
| POST | `/org/projects` | Create project `{ "name", "description?" }` |
| GET | `/org/sso` | Get SSO config (secret masked) |
| PUT | `/org/sso` | Save Google OAuth settings |
| POST | `/org/sso/test` | Test Google OIDC connectivity |

### Create user example

```http
POST /api/v1/org/users
{
  "username": "jane",
  "email": "jane@acme.com",
  "role": "member",
  "temporary_password": "ChangeMe123!",
  "project_assignments": [
    {
      "project_id": "uuid",
      "permissions": ["project:read", "chat:use", "search:use"]
    }
  ]
}
```

### SSO config example (admin settings page)

```http
PUT /api/v1/org/sso
{
  "enabled": true,
  "client_id": "<google-client-id>",
  "client_secret": "<google-client-secret>",
  "email_domains": ["acme.com"]
}
```

`callback_url` in GET response → register this in Google Cloud Console:

`{SSO_CALLBACK_BASE_URL}/api/v1/auth/sso/callback`

---

## Environment variables (deployment)

Set in **each deployment's** `.env` (not hardcoded to localhost in production):

| Variable | Purpose |
|----------|---------|
| `ALLOW_PUBLIC_REGISTRATION` | `false` = login-only |
| `DISABLE_EMAIL_VERIFICATION` | Skip verify gate on login |
| `SSO_ENABLED` | Global SSO kill switch |
| `SSO_CALLBACK_BASE_URL` | **Public URL of this backend** (e.g. `https://api.customer.com`) |
| `SSO_REQUIRE_REDIS` | `true` for Docker/multi-worker |
| `FRONTEND_BASE_URL` | SPA URL for post-SSO redirect (local target: `http://localhost:9091`) |
| `PUBLIC_API_BASE_URL` | Optional; fallback for callback URL |

See [configuration.md](./configuration.md).

---

## Bootstrap (ops — not frontend)

First admin per deployment:

```bash
python -m app.cli bootstrap-org-admin \
  --org-name "Acme" --org-slug acme \
  --email admin@acme.com --username admin \
  --password 'SecurePassword123!'
```

---

## Frontend pages to add / update

| Page / route | Backend APIs |
|--------------|--------------|
| `/login` | `public-config`, password login, SSO start link |
| `/login/callback` | Handle SSO redirect; call `auth/verify` |
| `/signup` | **Remove or hide** when `registration_enabled: false` |
| `/team` or `/settings/organization` | `/org/users`, assignments |
| `/settings/sso` | `/org/sso` GET/PUT/POST test |

**Existing monorepo reference (do not edit):**  
`/Users/arun/Library/Mobile Documents/com~apple~CloudDocs/Desktop/RAGSUITE/frontend/client/src/services/api/authDocsKeysOverview.ts` — extend `getPublicConfig` return type with `sso_enabled`, `organization_slug`.

---

## Not yet implemented

| Feature | Status |
|---------|--------|
| SAML SSO | Planned |
| SCIM / group sync | Planned |
| JIT auto-provision on SSO | Disabled (phase 1) |
| SSO-only (disable password login) | Planned |
| Full ACL on every route module | Partial (projects + crawl) |
| Org admin frontend UI | Frontend team |

---

## Related docs

- [api-reference.md](./api-reference.md) — full route list
- [external-client-contract.md](./external-client-contract.md) — SPA integration checklist
- [auth-and-security.md](./auth-and-security.md) — dependencies, session model
- [data-models.md](./data-models.md) — tables
- [planned/organization-architecture.md](../planned/organization-architecture.md) — product rationale (historical)
- [planned/sso.md](../planned/sso.md) — SAML/SCIM roadmap
