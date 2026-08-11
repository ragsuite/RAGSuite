# Changelog — AI & Documentation

Changes to `docs/ai/` and major documentation structure.

## [1.5.0] - 2026-07-15

### Added

- `.cursor/rules/workspace-isolation.mdc` — never merge backend + mobile workspaces/git
- `.cursor/rules/documents-preview-embeddings.mdc` — content-stream, Gmail MIME, coverage cache, reindex
- `.cursorignore` — defensive ignore of nested/foreign UI trees + heavy runtime dirs

### Changed

- Workspace isolation: **dual-repo tasks** (backend file A + frontend file B) → edit both via absolute paths; never merge Cursor/git
- Root `README.md` — rewritten for standalone architecture; target Expo web **`:9091`**; pairing with frontend (Server workspace); removed stale `:8000` examples
- `AGENTS.md`, `docs/ai/AI_PROJECT_MEMORY.md`, `docs/ai/PROJECT_CONTEXT.md` — `:9091`, SSO/org mobile progress, document/preview/reindex notes, workspace isolation
- `docs/frontend/*` — status matrix + gaps updated (SSO/org largely DONE; remaining connector panels + public-config)
- `.cursor/skills/ragsuite-backend` + `ragsuite-frontend` — ports, isolation, document gotchas
- `docs/backend/external-client-contract.md` — `FRONTEND_BASE_URL` → `:9091`

## [1.4.0] - 2026-07-08

### Added

- `docs/frontend/` — legacy Vite SPA vs **frontend (Server workspace)** compatibility (goal, comparison, gaps, plan, mobile orientation)
- `.cursor/skills/ragsuite-frontend/SKILL.md` — target frontend skill for agents in this repo

### Changed

- `AGENTS.md`, `docs/ai/*`, backend skill, `external-client-contract.md`, `docs/planned/README.md` — dual-client auth (cookie + Bearer); target UI = frontend (Server workspace)
- Root `README.md` **not** modified (per request)

## [1.3.0] - 2026-07-08

### Changed

- Confluence, SharePoint, Slack connectors marked **shipped** across `docs/connectors/`, `docs/backend/*`, `docs/planned/`, `docs/ai/*`, skill, `AGENTS.md`
- `scripts/smoke_connectors.py` — smoke for all five connectors
- Remaining planned: SAML/SCIM + external SPA panels

## [1.2.0] - 2026-07-07

### Removed

- Sibling app `/Users/arun/Documents/frontend` (deleted from disk)
- `docs/frontend-ai/`, `docs/frontend/`, `.cursor/skills/ragsuite-frontend/`, `FRONTEND_AGENTS.md`, `scripts/start-frontend.sh`
- Frontend startup from `start.sh` (backend-only)

### Added

- `docs/backend/external-client-contract.md` (moved from frontend-ai bundle)

### Changed

- `AGENTS.md`, `docs/ai/*`, backend skill — backend-only wording

## [1.1.0] - 2026-07-07

### Added

- `docs/planned/` — copied from monorepo: org architecture, SSO, master roadmap (paths adapted for standalone `app/`)
### Added (2026-07-07)

- `docs/frontend-ai/` — frontend-only agent bundle (deletable separately)
- `.cursor/skills/ragsuite-frontend/`, `FRONTEND_AGENTS.md`

### Added (2026-07-07 earlier)

- `docs/frontend-ai/backend-contract.md` — external SPA/widgets contract (ports 8002/5175)

### Changed

- `docs/ai/AI_PROJECT_MEMORY.md` — standalone layout, ports, frontend-optional, monorepo reference
- `docs/ai/PROJECT_CONTEXT.md` — same; next milestone = Organization architecture
- `docs/ai/PROJECT_ONBOARDING_PROMPT.md` — repo-root paths, Phase 0 ground truth for standalone
- `docs/ai/AI_PROJECT_CONTEXT_REPORT.md` — full rewrite for this repo + monorepo lineage
- `.cursor/skills/ragsuite-backend/SKILL.md` — `app/` paths, port 9090, org milestone
- `docs/backend/README.md` — code layout, OpenAPI port, migration command
- `AGENTS.md` — monorepo reference, frontend-optional note, org milestone

### Context source

Synced from `/Users/arun/Desktop/RAGSUITE/docs/ai/` and `docs/planned/` (full-stack monorepo).

## [1.0.0] - 2026-07-03

### Added

- `PROJECT_ONBOARDING_PROMPT.md` — RAGSuite-specific AI onboarding (adapted from universal template)
- `AI_PROJECT_CONTEXT_REPORT.md` — evidence-cited full context report
- `AI_PROJECT_MEMORY.md` — compact agent memory
- `PROJECT_CONTEXT.md` — human-maintained project context
- `docs/backend/` — full backend reference (API, config, models, auth, jobs)
- `docs/frontend/backend-contract.md` — frontend/backend alignment
- `.cursor/skills/ragsuite-backend` and `ragsuite-frontend`

### Changed

- Reorganized `docs/` into folders: `ai/`, `operations/`, `planned/`, `product/`, `connectors/`, `backend/`, `frontend/`
- Merged connector overview into `docs/connectors/README.md`
- Removed duplicate `api-overview.md` (superseded by `backend/api-reference.md`)
- Removed `docs/prompt_ex/` (templates applied to `docs/ai/`)

### Moved

| From | To |
|------|-----|
| `docs/development.md`, `deployment.md`, … | `docs/operations/` |
| `docs/future-implementations.md` | `docs/planned/README.md` |
| `docs/organization-architecture.md`, `sso.md` | `docs/planned/` |
| `docs/ragsuite-feature-sop-*.md/pdf` | `docs/product/` |
