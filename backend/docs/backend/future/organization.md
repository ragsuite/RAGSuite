# Future: Organization — Backend Specification

> **⚠️ IMPLEMENTED** — This file is an archived design spec.  
> **Use instead:** [organization-and-sso.md](../organization-and-sso.md) · [api-reference.md](../api-reference.md#organization-routesorganizationpy--org)

**Status:** ~~Planned~~ → **Shipped** (2026-07-07)  
**Depends on:** Existing `Organization`, `User.org_id`, `ALLOW_PUBLIC_REGISTRATION`  
**Last updated:** 2026-07-07  
**Product design:** [../../planned/organization-architecture.md](../../planned/organization-architecture.md)

---

## Goals (backend)

1. Org-scoped user provisioning (admin creates users — no public register)
2. Project-level ACL (`project_members`)
3. Replace global `is_admin` checks with `organization_members.role`
4. Bootstrap first org admin via CLI (no API registration path for admin)
5. Enforce `Organization.max_users` on create

**Frontend implements later** against these APIs.

---

## New tables

### `organization_members`

```sql
CREATE TABLE organization_members (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'member',  -- 'org_admin' | 'member'
  is_active BOOLEAN NOT NULL DEFAULT true,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, user_id)
);
```

### `project_members`

```sql
CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '[]',  -- string array
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, user_id)
);
```

### Extend `organizations`

```sql
ALTER TABLE organizations ADD COLUMN registration_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN default_member_permissions JSONB DEFAULT '[]';
```

### Extend `projects`

```sql
ALTER TABLE projects ADD COLUMN org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;
```

### Extend `users`

```sql
ALTER TABLE users ADD COLUMN provisioned_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'local';  -- local | sso
```

---

## Permission strings

```text
project:read
project:write
project:admin
crawl:manage
documents:manage
connectors:manage
chat:use
search:use
analytics:read
api_keys:manage
widgets:manage
settings:manage
```

`org_admin` bypasses project permission checks within their org.

---

## New auth dependencies (`auth.py`)

```python
async def get_current_org_member(...) -> tuple[User, OrganizationMember]
async def require_org_admin(...) -> User
def require_project_permission(permission: str):
    # Checks project_members.permissions or org_admin
```

**Migration of existing routes:** Replace `_ensure_project_owner` pattern in connectors with `require_project_permission("connectors:manage")`.

---

## API routes — `routes/organization.py`

**Prefix:** `/api/v1/org`  
**Auth:** `require_org_admin` unless noted

### Organization

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/org` | Org member | Get current org details + quotas |
| PUT | `/org` | Org admin | Update name, default permissions |

**GET `/org` response:**
```json
{
  "id": 1,
  "name": "Acme Corp",
  "slug": "acme",
  "max_users": 50,
  "max_projects": 10,
  "registration_enabled": false,
  "member_count": 12,
  "project_count": 4
}
```

### Users

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/org/users` | List org members `?is_active=&role=&q=` |
| POST | `/org/users` | Create user (admin provisioned) |
| GET | `/org/users/{user_id}` | Get member detail |
| PATCH | `/org/users/{user_id}` | Update profile fields, role, is_active |
| DELETE | `/org/users/{user_id}` | Soft-deactivate (set is_active=false, revoke sessions) |
| POST | `/org/users/{user_id}/reset-password` | Trigger password reset email |
| POST | `/org/users/{user_id}/force-password` | Set temporary password (admin) |

**POST `/org/users` request:**
```json
{
  "username": "jane.doe",
  "email": "jane@acme.com",
  "role": "member",
  "temporary_password": "optional-string",
  "send_invite_email": true,
  "project_assignments": [
    { "project_id": "uuid", "permissions": ["project:read", "chat:use", "crawl:manage"] }
  ]
}
```

**POST `/org/users` response:** `201` + `UserResponse` + `organization_member` block

**Errors:**
- `403` — not org admin
- `409` — email/username exists
- `429` — `max_users` exceeded

### Project assignments

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/org/users/{user_id}/projects` | List project memberships |
| PUT | `/org/users/{user_id}/projects` | Replace all assignments |
| PATCH | `/org/users/{user_id}/projects/{project_id}` | Update permissions for one project |

**PUT body:**
```json
{
  "assignments": [
    { "project_id": "uuid", "permissions": ["project:read", "documents:manage"] }
  ]
}
```

### Org projects (admin view)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/org/projects` | All projects in org (admin sees all) |
| POST | `/org/projects` | Create project in org (sets org_id) |

---

## Changes to existing routes

### Registration

| Endpoint | Change |
|----------|--------|
| `POST /crawl/auth/register` | Return `403` when `ALLOW_PUBLIC_REGISTRATION=false` OR org `registration_enabled=false` |
| `GET /crawl/auth/public-config` | Add `sso_enabled`, `organization_slug` (optional) |

### Projects

| Endpoint | Change |
|----------|--------|
| `GET /projects` | Members see only assigned projects; org_admin sees all org projects |
| `POST /projects` | Set `org_id` from user's org; check `max_projects` |

### All project-scoped routes

Add `require_project_permission(...)` instead of owner-only checks.

---

## CLI bootstrap

**New:** `app/cli.py` (or extend existing)

```bash
python -m app.cli bootstrap-org-admin \
  --org-name "Acme Corp" \
  --org-slug acme \
  --email admin@acme.com \
  --username admin \
  --password "<secure>"
```

Creates: `Organization`, `User`, `organization_members` with `role=org_admin`.  
Sets `ALLOW_PUBLIC_REGISTRATION=false` recommendation in output (env change manual).

---

## Audit events (new types)

```text
org.user.created
org.user.deactivated
org.user.role_changed
org.project.assigned
org.project.unassigned
org.settings.updated
```

Payload: `{ "target_user_id", "project_id", "permissions", "actor_id" }`

---

## Migration & backfill

1. Create tables
2. Create default org from first `is_admin` user or single org named "Default"
3. Backfill `organization_members`: all existing users → `org_admin` if `is_admin` else `member`
4. Backfill `projects.org_id` from owner's org
5. Backfill `project_members`: project owner gets `project:admin` + all permissions

---

## Frontend contract (for alignment)

When frontend implements Team/Org UI, expect:

| UI action | API |
|-----------|-----|
| User list table | `GET /org/users` |
| Create user modal | `POST /org/users` |
| Assign projects checkboxes | `PUT /org/users/{id}/projects` |
| Deactivate toggle | `PATCH /org/users/{id}` `{ "is_active": false }` |
| Hide signup | `GET /crawl/auth/public-config` → `registration_enabled: false` |

**Field naming:** snake_case in JSON (frontend maps to camelCase in services).

**Auth:** Same session cookie as today; org admin is not a separate login.

---

## Tests checklist

- [ ] Register blocked when `ALLOW_PUBLIC_REGISTRATION=false`
- [ ] Org admin creates member; member cannot access unassigned project (403)
- [ ] Member with `documents:manage` can upload; without cannot
- [ ] `max_users` enforced
- [ ] Deactivated user gets 401 on login
- [ ] Bootstrap CLI creates org + admin
- [ ] Audit events written on user create/assign

---

## Files to create/modify

| File | Action |
|------|--------|
| `alembic/versions/*_org_members.py` | Migration |
| `models.py` | New models |
| `schemas.py` | Org user DTOs |
| `auth.py` | New dependencies |
| `routes/organization.py` | New router |
| `main.py` | Register router |
| `routes/crawl.py` | Registration gate |
| `routes/projects.py` | ACL on list/create |
| `routes/connectors*.py` | Replace owner check |
| `app/cli.py` | Bootstrap command |
| `tests/test_organization.py` | Tests |
