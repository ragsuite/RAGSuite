# ADR-008 — CLI

## Status

Accepted (Phase 0 freeze)

## Context

Operators need one published installer/lifecycle CLI. Enterprise must not ship a second npm package that installs the product.

## Decision

### One published CLI

- Published from the **Community** repo only.
- Package: `@ragsuite/ragsuite` (bin: `ragsuite`).
- **EE is never npm-published as an installer.**

### Command surface (target)

| Command | Purpose |
|---------|---------|
| `init` | Scaffold / configure a deployment |
| `start` | Start stack (API `:9090`, web `:9191` native DX) |
| `stop` | Stop host processes (no data wipe) |
| `update` | Update Platform / CE artifacts |
| `activate` | Activate / bind license or machine (with License Server when online) |
| `license` | Install / show / verify offline license key |
| `doctor` | Health, ports, version compatibility, Extension issues |
| `bundle` | Install / verify / list Enterprise Bundles |
| `status` | Runtime status summary |
| `extensions` | List discovered / loaded Extensions |
| `plugins` | Alias or subset for marketplace-style plugins (same Extension model) |

Existing commands (`restart`, `logs`, `version`) remain supported as DX aliases or subcommands where already present; new work prefers the table above.

### CLI vs Platform

- CLI orchestrates processes and local files (env, bundles, license key path).
- Platform owns runtime Extension loading (ADR-003).
- CLI does not embed RAG business logic.

### DX invariant

```bash
cd /Users/arun/RAGSUITE && npm start
# API http://localhost:9090 · Expo http://localhost:9191
```

With EE attached for development (Phase 6), the same command — one workspace feel.

## Consequences

- Phase 9 refactors CLI toward this surface.
- Phase 10 wires `activate` / `license` / `bundle` to offline verify + optional License Server download auth.
