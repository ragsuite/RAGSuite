# RAGSuite Mobile — Documentation Index

> **AI assistants:** Read [AI_PROJECT_MEMORY.md](../AI_PROJECT_MEMORY.md) first, then this file, then the task-specific doc below.

## Reading order

1. [AI_PROJECT_MEMORY.md](../AI_PROJECT_MEMORY.md) — compact project memory (always)
2. **This file** — route to the right deep-dive doc
3. Task-specific doc from the table below
4. [AGENTS.md](../AGENTS.md) — required for any UI/styling work

Humans maintaining the project should also keep [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) up to date.

## Documentation map

| Document | Purpose | Read when |
| -------- | ------- | --------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Real folder structure, data flow, network layer | New to codebase, API work, routing bugs |
| [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md) | Standalone backend `/api/v1` map, OAuth URIs, auth/connectors | API integration, OAuth, connectors, auth |
| [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md) | Gaps vs Server backend (org/SSO/connectors) | Compatibility work; avoid inventing APIs |
| [PRODUCT.md](./PRODUCT.md) | Modules, navigation, screens, user flows | Feature work, UX questions, route discovery |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Setup, commands, PR checklist | First run, before merge |
| [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) | Naming, shared components, patterns | Any code change |
| [MODULE_GUIDE.md](./MODULE_GUIDE.md) | Per-feature file locations and risks | Bug fix or change in a specific module |
| [TESTING_AND_QA.md](./TESTING_AND_QA.md) | QA matrices, verification bar | Before claiming done |
| [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md) | Task workflows for AI agents | Bug fix, feature, UI tasks |
| [WEB_MOBILE_PARITY.md](./WEB_MOBILE_PARITY.md) | Parity vs **legacy Vite SPA** UI (not backend gap matrix) | Migrating UX from old frontend |
| [QA_ONBOARDING.md](./QA_ONBOARDING.md) | Onboarding-specific QA cases | Onboarding changes only |
| [REVIEW_ONBOARDING.md](./REVIEW_ONBOARDING.md) | Onboarding review notes | Onboarding review only |

## Root context files

| File | Role |
| ---- | ---- |
| [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) | Human-maintained source of truth |
| [AI_PROJECT_CONTEXT_REPORT.md](../AI_PROJECT_CONTEXT_REPORT.md) | Detailed evidence-cited analysis |
| [AGENTS.md](../AGENTS.md) | Locked brand / design contract |
| [PROJECT_ONBOARDING_PROMPT.md](../PROJECT_ONBOARDING_PROMPT.md) | How AI artifacts were generated |

## Task routing

| Task type | Read |
| --------- | ---- |
| **Bug fix** | [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md) → [MODULE_GUIDE.md](./MODULE_GUIDE.md) → [TESTING_AND_QA.md](./TESTING_AND_QA.md) |
| **New feature** | [PRODUCT.md](./PRODUCT.md) → [ARCHITECTURE.md](./ARCHITECTURE.md) → [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) |
| **UI / screenshot parity** | [AGENTS.md](../AGENTS.md) → `.cursor/rules/reference-ui-parity.mdc` → [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) |
| **Chatbot ↔ Search config / model API keys / widget feedback language** | [MODULE_GUIDE.md](./MODULE_GUIDE.md) → `.cursor/skills/chatbot-search-config-parity/` → [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) |
| **API integration / OAuth / connectors** | [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md) → [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md) → [ARCHITECTURE.md](./ARCHITECTURE.md) → `src/network/apiUrl.ts` |
| **Backend compatibility** | [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md) + backend repo `docs/frontend/` (read-only) |
| **Refactor / cross-cutting** | [ARCHITECTURE.md](./ARCHITECTURE.md) → [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) → `.cursor/skills/multi-agent-engineering/SKILL.md` |

## Cursor tooling

| Path | Purpose |
| ---- | ------- |
| `.cursor/rules/` | Always-applied and contextual rules |
| `.cursor/skills/` | Workflows (bug-fix, multi-agent, screenshot clone, **ragsuite-backend-contract**, **chatbot-search-config-parity**) |
| `.cursor/agents/` | Role prompts (planner, developer, QA, reviewer) |
| `.cursor/commands/` | Slash commands (`/bug-fix`, `/match-reference`, etc.) |

## Quick verification

```bash
yarn install
yarn env:local
yarn lint
yarn test
yarn tsc --noEmit
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for full setup and PR requirements.
