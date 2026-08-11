# AI Assistant Guide

> Playbook for AI agents working on RAGSuite Mobile. Enforced by `.cursor/rules/project-context.mdc` and `.cursor/rules/system.md`.

## Context reading order

1. [AI_PROJECT_MEMORY.md](../AI_PROJECT_MEMORY.md) — always
2. [docs/README.md](./README.md) — route to the right deep-dive doc
3. Task-specific doc (see routing below)
4. For **API / connectors / OAuth / auth against backend:** [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md) + [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md)
5. [AGENTS.md](../AGENTS.md) — required for any UI/styling work

## Task classification

| Size | Criteria | Lifecycle |
| ---- | -------- | --------- |
| **Small** | Localized fix, no architecture decision, 1–3 files | Compressed: read context → fix → verify |
| **Major** | Module-level, cross-cutting, new patterns, high risk | Full: PLANNER → DEVELOPER → QA → REVIEWER |

When uncertain, treat as **major**.

## Task routing

| Task | Read | Skill / command |
| ---- | ---- | --------------- |
| Bug fix | [MODULE_GUIDE.md](./MODULE_GUIDE.md), [TESTING_AND_QA.md](./TESTING_AND_QA.md) | `.cursor/skills/bug-fix-investigation/`, `/bug-fix` |
| New feature | [PRODUCT.md](./PRODUCT.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) | `/implement-feature`, multi-agent-engineering |
| UI parity (screenshot) | [AGENTS.md](../AGENTS.md), reference-ui-parity rule | `/match-reference`, screenshot-ui-clone skill |
| UI improvement (no reference) | [AGENTS.md](../AGENTS.md), premium-saas rule | `/improve-ui` |
| API / OAuth / backend compat | [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md), [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md) | `.cursor/skills/ragsuite-backend-contract/` |
| Chatbot ↔ Search config / model keys / widget feedback language | [MODULE_GUIDE.md](./MODULE_GUIDE.md), [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) | `.cursor/skills/chatbot-search-config-parity/` |

## Bug-fix workflow

1. Read `AI_PROJECT_MEMORY.md` + relevant row in [MODULE_GUIDE.md](./MODULE_GUIDE.md)
2. Reproduce on reported platform
3. Trace: route → hook → `*.actions.ts` → mapper → component
4. Identify root cause — do not patch symptoms
5. Minimal diff; match existing conventions ([CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md))
6. Verify per [TESTING_AND_QA.md](./TESTING_AND_QA.md)
7. Report what was verified and any residual risk

## Feature implementation workflow

1. Product context gate: ClickUp task, references, current behavior parity map
2. Plan: scope, risks, acceptance criteria, files to change
3. Reuse shared components from [CODE_CONVENTIONS.md](./CODE_CONVENTIONS.md) catalog
4. Implement in strict TypeScript
5. QA all states (loading, empty, error)
6. Staff-level self-review before claiming done

## UI workflow

### With reference screenshots

- Reference is the **contract** — parity beats creativity
- Build Reference Parity Inventory before coding
- Reuse crawl/configuration patterns — do not invent parallel components
- Complete Reference Parity Checklist before done

### Without reference

- Follow [AGENTS.md](../AGENTS.md) brand system
- Premium SaaS states per `.cursor/rules/premium-saas.mdc`
- Do not default to generic Linear/Vercel aesthetics over brand

## What NOT to do

- Do not assume Redux, `App.tsx`, or `store/` — see [ARCHITECTURE.md](./ARCHITECTURE.md)
- Do not invent API paths — use [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md) and `src/network/apiUrl.ts`
- Do not put Gmail under `/connectors/gmail` — Gmail is `/api/v1/gmail/*`
- Do not confuse [WEB_MOBILE_PARITY.md](./WEB_MOBILE_PARITY.md) with [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md)
- Do not hardcode hex colors outside brand tokens
- Do not nest `Pressable` buttons on web
- Do not duplicate UI primitives that already exist
- Do not edit unrelated files
- Do not skip verification commands before claiming done
- Do not redesign when user asked for exact parity
- Do not edit root `README.md` for backend-compat doc work unless explicitly asked
- Do not modify sibling clones `/Users/arun/RAGSuite_backend` or `/Users/arun/mobile-ragsuite` — stay in `RAGSuite_Server`
- Same-workspace backend (`../backend`) may be edited when the task requires API + UI changes
- Do not use dashboard locale for chatbot widget / search-test **feedback** strings — use product language
- Do not treat Chatbot model-settings UX as independent of Search — match Search unless explicitly different
- Do not claim “API key saved” unless `isSavedApiKeyMarker(apiKeyMasked)` is true
- Do not parse model test-connection results without unwrapping `data` (missing fields ⇒ false success)

## Cursor roles

| Role | Agent file |
| ---- | ---------- |
| Planner | `.cursor/agents/planner.md` |
| Developer | `.cursor/agents/developer.md` |
| QA | `.cursor/agents/qa-engineer.md` |
| Reviewer | `.cursor/agents/staff-reviewer.md` |
| UI/UX | `.cursor/agents/ui-ux-designer.md` |

## Verification commands

```bash
yarn lint
yarn test
yarn tsc --noEmit
```

## Related docs

- [docs/README.md](./README.md) — full documentation index
- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md) — human-maintained overview
- `.cursor/rules/system.md` — lifecycle enforcement
