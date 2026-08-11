# Future Backend Implementations

**Scope:** Features **not yet shipped**. For implemented org + Google SSO, see **[organization-and-sso.md](../organization-and-sso.md)**.  
**Last updated:** 2026-07-08

| Feature | Status | Document |
|---------|--------|----------|
| Organization admin + Google OIDC SSO | ✅ **Shipped** | [organization-and-sso.md](../organization-and-sso.md) |
| Connectors: Drive, Notion, Confluence, SharePoint, Slack | ✅ **Shipped** | [../../connectors/README.md](../../connectors/README.md) · [connectors.md](./connectors.md) (archive) |
| SAML SSO, SCIM | Planned | [sso.md](./sso.md) (historical spec) |

**Archived specs (implemented):** [organization.md](./organization.md) · [sso.md](./sso.md) · [connectors.md](./connectors.md) — kept for history.

---

## Implementation order (remaining)

```text
1. Frontend: Team + SSO settings + login SSO + connector panels (external SPA)
2. SAML SSO + SCIM (enterprise)
3. Full ACL rollout on all route modules (incl. connectors)
```

---

## Shared conventions

- Schemas in `schemas.py`, migrations in `alembic/`, routers in `main.py`
- Update [api-reference.md](../api-reference.md) and [organization-and-sso.md](../organization-and-sso.md) when shipping auth features
- Update [external-client-contract.md](../external-client-contract.md) for frontend-facing changes
