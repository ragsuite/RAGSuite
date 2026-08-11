# Contributing (Community Edition)

Thank you for contributing to **RAGSuite Community**.

## Setup (CE-only)

```bash
cd /Users/arun/RAGSUITE   # or your clone
npm run setup             # soft-attaches EE if sibling exists; CE works without it
npm start                 # API :9090 · Expo :9191
```

CE must boot with **no** `RAGSUITE_EE_ROOT`. Do not copy private EE source into this tree.

## Docs to read first

- [AGENTS.md](./AGENTS.md) / [README.md](./README.md)
- [docs/architecture/DEV-WORKSPACE.md](./docs/architecture/DEV-WORKSPACE.md)
- [docs/architecture/MODULE-SYSTEM.md](./docs/architecture/MODULE-SYSTEM.md)
- [docs/architecture/EXTENSION-SDK.md](./docs/architecture/EXTENSION-SDK.md)
- [docs/architecture/TEST-MATRIX.md](./docs/architecture/TEST-MATRIX.md)

## Tests

```bash
cd backend && RAGSUITE_EE_ROOT= pytest tests/ -q -m "not ee"
cd cli && npm test
```

## Rules of thumb

- Prefer Platform / Module boundaries — no accidental module→module imports.
- Do not commit secrets, License private keys, or EE private source.
- Ports: API **9090**, Expo **9191**, Postgres **5436**, Redis **6382**.

## License

Community Edition is licensed under the [Apache License, Version 2.0](https://github.com/ragsuite/RAGSuite/blob/main/LICENSE).
See [NOTICE](https://github.com/ragsuite/RAGSuite/blob/main/NOTICE) for attribution and scope.

By contributing, you agree that your contributions are licensed under the
same Apache License 2.0, without additional terms, unless you state otherwise
in writing (Apache License §5).

## Enterprise

Enterprise modules and bundles are **private** (`RAGSUITE_EE`). Maintainers: see sibling repo `RAGSUITE_EE/docs/ENTERPRISE-GUIDE.md`.
