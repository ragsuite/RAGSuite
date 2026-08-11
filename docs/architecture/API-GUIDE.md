# API Guide (index)

HTTP API surface for RAGSuite Community / Platform.

## Primary references

| Doc | Purpose |
|-----|---------|
| [backend/docs/backend/api-reference.md](../../backend/docs/backend/api-reference.md) | Backend API reference |
| [audit/API-ROUTE-MAP.md](./audit/API-ROUTE-MAP.md) | Route inventory / classification |
| OpenAPI | Served by the running API (typical: `http://localhost:9090/docs`) |

## Conventions

- Base path: `/api/v1/…`
- Auth: Bearer JWT (user) or widget/project headers where documented
- Ports: API **9090** (this project); do not use sibling-stack ports

## Edition notes

- Community routes work without a license.
- Enterprise routes/modules require entitled offline key + EE modules loaded (workspace or bundle). See [ACTIVATION.md](./ACTIVATION.md).
