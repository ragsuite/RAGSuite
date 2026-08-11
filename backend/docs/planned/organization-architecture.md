# Organization Architecture — Design & Implementation Plan

**Status:** **Partially implemented** (backend APIs + Google SSO shipped; frontend + SAML pending)  
**Last updated:** 2026-07-07  
**Implementation reference:** [../backend/organization-and-sso.md](../backend/organization-and-sso.md)  
**Related:** [../architecture.md](../architecture.md) · [sso.md](./sso.md) · [README.md](./README.md)  
**Code layout:** `app/` at repo root (standalone backend). Monorepo reference: `/Users/arun/Desktop/RAGSUITE`

---

## Executive summary

RAGSuite will adopt a **professional B2B organization model**: one organization per customer deployment, with **organization admins** who manage users, roles, and access. **Self-registration is disabled** — neither regular users nor admins can sign up through the public UI. Only **login** is exposed; all accounts are **provisioned by an admin** (or via SSO JIT provisioning in a later phase).

This document describes the target architecture, how it differs from today, and the implementation plan.

---

## Target model

```
Organization (tenant)
  │
  ├── Org Admin(s)          — full org control: users, roles, projects, connectors, billing hooks
  │
  ├── Users (member)        — access scoped by admin-assigned permissions
  │
  └── Projects              — knowledge workspaces; users see only projects they are assigned to
        ├── Crawl sources, documents, connectors
        ├── Chat / search config, widgets, API keys
        └── ChromaDB collection (project_id)
```

### Principles

| Principle | Description |
|-----------|-------------|
| **No public registration** | Remove or hide signup UI and disable `POST /auth/register` in production. Bootstrap first org admin via CLI/seed only. |
| **Admin-provisioned users** | Org admins create, invite, deactivate, and reset users. No user becomes admin via self-signup. |
| **Least privilege** | Default member has minimal access; admin grants project and feature permissions explicitly. |
| **Org-scoped data** | All projects, quotas, connectors, and audit events belong to an organization. |
| **Admin hierarchy** | Org Admin > Member. Optional future: Super Admin (platform operator) for multi-org SaaS. |

---

## Current state (as of 2026-07)

Partial building blocks already exist in the codebase:

| Area | Today | Gap vs target |
|------|--------|----------------|
| **Organization entity** | `organizations` table with quota fields (`max_users`, `max_projects`, …); `User.org_id` FK | No org admin UI, no user–org membership roles beyond `is_admin` boolean on user |
| **Admin flag** | `User.is_admin` + `get_current_admin_user()` dependency | Global admin, not org-scoped; no role matrix |
| **Registration** | `POST /api/v1/crawl/auth/register` + `/signup` frontend route | Must be disabled/hidden in target model |
| **Projects** | Owned by `user_id`; scoped by `project_id` in APIs | Not yet org-owned; no project-level member ACL |
| **Quotas** | Org-level caps enforced at enqueue/claim (Sprint 4) | Good foundation for per-org limits |
| **Audit** | `audit_events` with user attribution | Needs org_id and admin-action event types |

---

## Role definitions (target)

### Organization Admin (`org_admin`)

- Create, update, deactivate, and delete users within the organization
- Assign and revoke roles and project access for members
- Create and archive projects; assign project owners
- Configure org-wide defaults (SSO, connector policies, retention — future)
- View org-wide analytics, audit logs, and usage
- Cannot self-register; first admin created by **bootstrap** (see below)

### Member (`member`)

- Log in only (no registration)
- Access only projects and features granted by org admin
- Manage own profile, password (unless SSO-only), 2FA, sessions
- Cannot create other users or elevate privileges

### Platform Super Admin (optional, multi-tenant SaaS)

- Manages multiple organizations
- Not required for single-tenant / private deployments
- Defer until multi-org SaaS is a product requirement

---

## Permission matrix (target)

Permissions are **additive** per user per project (and optionally org-wide).

| Capability | Org Admin | Member (default) | Member (granted) |
|------------|-----------|------------------|------------------|
| Log in | ✓ | ✓ | ✓ |
| Self-register | ✗ | ✗ | ✗ |
| Create users | ✓ | ✗ | ✗ |
| Assign project access | ✓ | ✗ | ✗ |
| Create projects | ✓ | ✗ | Optional grant |
| Crawl / upload / connectors | ✓ | ✗ | Per-project grant |
| Chat / search (admin console) | ✓ | ✗ | Per-project grant |
| API keys | ✓ | ✗ | Per-project grant |
| Widget / integration config | ✓ | ✗ | Per-project grant |
| View analytics | ✓ (org) | ✗ | Per-project grant |
| Audit logs | ✓ (org) | ✗ | Optional read-only grant |

Granular permission keys (examples for `user_project_permissions` or JSON role):

- `project:read`, `project:write`, `project:admin`
- `crawl:manage`, `documents:manage`, `connectors:manage`
- `chat:use`, `search:use`, `analytics:read`
- `api_keys:manage`, `widgets:manage`, `settings:manage`

---

## Data model (proposed)

Extend existing models; do not break current single-user deployments during migration.

### `organizations` (extend existing)

| Column | Purpose |
|--------|---------|
| `id`, `name`, `slug` | Existing |
| `max_*` quota fields | Existing (Sprint 4) |
| `registration_enabled` | `false` by default in production |
| `sso_enabled` | Link to SSO config (see [sso.md](./sso.md)) |
| `default_member_role` | Default permission set for new members |

### `organization_members` (new)

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `org_id` | FK → organizations |
| `user_id` | FK → users |
| `role` | `org_admin` \| `member` |
| `is_active` | Soft deactivate without delete |
| `invited_by` | FK → users |
| `joined_at`, `created_at` | Timestamps |

Unique: `(org_id, user_id)`.

### `project_members` (new)

| Column | Purpose |
|--------|---------|
| `id` | PK |
| `project_id` | FK → projects |
| `user_id` | FK → users |
| `permissions` | JSON array of permission strings |
| `granted_by` | FK → users |

Unique: `(project_id, user_id)`.

### `users` (extend existing)

| Change | Purpose |
|--------|---------|
| Keep `org_id` | Primary organization |
| Deprecate global `is_admin` over time | Replace with `organization_members.role` |
| `provisioned_by` | Admin user id or `sso_jit` |
| `must_change_password` | For admin-created accounts |

### `projects` (extend existing)

| Change | Purpose |
|--------|---------|
| `org_id` | FK → organizations (required for new projects) |
| Keep `owner_id` | Project owner (usually org admin or delegated lead) |

---

## Authentication & UX (target)

### Login-only surface

- **Show:** Login, forgot password (if local auth), 2FA verify, SSO button (when enabled)
- **Hide/remove:** Signup page, “Create account” links, public register API
- **Bootstrap:** CLI command e.g. `python -m app.cli create-org-admin --org "Acme" --email admin@acme.com` creates org + first admin (no UI registration)

### Admin user management UI (new)

Location: **Settings → Organization → Users** (or dedicated **Team** section)

| Action | Behavior |
|--------|----------|
| **Create user** | Admin enters email, username, temporary password or “send invite email” |
| **Invite user** | Email with one-time set-password link (no public signup) |
| **Edit user** | Name, department, active flag |
| **Assign projects** | Multi-select projects + permission checkboxes |
| **Deactivate** | Revoke sessions; user cannot log in |
| **Reset password** | Admin-triggered reset email |

### API authorization pattern

```text
Request → JWT → user → organization_members (role)
                    → project_members (permissions) for project-scoped routes
                    → deny if registration_disabled and route is register
```

New dependencies (conceptual):

- `get_current_org_member` — requires active org membership
- `require_org_admin` — org_admin role only
- `require_project_permission("documents:manage")` — project ACL check

---

## Migration path from today

| Phase | Work |
|-------|------|
| **M1 — Foundation** | `organization_members`, `project_members` tables; backfill existing users as org_admin of default org |
| **M2 — API guards** | Project routes check `project_members`; org routes check `org_admin` |
| **M3 — Admin UI** | User list, create, assign projects, deactivate |
| **M4 — Disable registration** | Env `REGISTRATION_ENABLED=false`; hide signup UI; rate-limit/block register endpoint |
| **M5 — SSO** | See [sso.md](./sso.md); JIT provision as `member` with admin approval optional |
| **M6 — Hardening** | Audit all admin actions; org-scoped analytics; SCIM (enterprise, optional) |

---

## Security requirements

- First org admin **only** via secure bootstrap (CLI or install wizard), never public form
- Admin cannot create another user with `org_admin` without existing org_admin (or super admin)
- Session revoke on deactivate
- Audit events: `user.created`, `user.deactivated`, `permission.granted`, `permission.revoked`, `project.assigned`
- Enforce `max_users` on org at user create
- Password policy for admin-created accounts; force change on first login

---

## Relationship to multi-tenancy

Today, **project_id** is the primary data isolation boundary. The organization layer sits **above** projects:

```text
org_id → quotas, users, SSO, billing
project_id → Chroma collections, crawl, documents, connectors, widgets
user_id → actor for audit and ownership
```

All three IDs appear in logs and audit for enterprise traceability.

---

## Files to touch (implementation reference)

| Layer | Files |
|-------|--------|
| Models | `app/models.py` |
| Migrations | `alembic/versions/` |
| Auth | `app/auth.py`, `app/routes/crawl.py` |
| New routes | `app/routes/organization.py`, `app/routes/org_users.py` |
| Frontend | Monorepo `frontend/client/src/pages/Team.tsx`, settings tabs (external) |
| Config | `app/settings.py` — `REGISTRATION_ENABLED` |
| CLI | `app/cli.py` — bootstrap org admin |

---

## Success criteria

- No user can gain access without admin provision or approved SSO JIT
- Org admin can create a member, assign one project with crawl-only access, and member cannot access other projects
- Register endpoint returns 403 when disabled
- Audit log shows who granted which permission
- Existing single-tenant installs migrate without data loss (default org + admin backfill)

---

## Related documentation

- [SSO](./sso.md) — federated login for organization members
- [Backend SSO spec](../backend/future/sso.md) — routes, tables, OIDC flow
- [Backend org spec](../backend/future/organization.md) — routes, tables, ACL
- [Connector plans](../connectors/README.md) — org-level connector policies (future)
- [Multi-tenant scaling roadmap](../operations/multi-tenant-scaling-roadmap.md) — org quotas (partially implemented)
- [README.md](./README.md) — master priority list
