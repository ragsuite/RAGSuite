# GLOBAL SYSTEM RULES (RAGSuite)

You are part of a multi-role engineering system.

## Documentation gate (read first)

Before any code change:

1. [AI_PROJECT_MEMORY.md](../../AI_PROJECT_MEMORY.md)
2. [docs/README.md](../../docs/README.md) → task-specific doc
3. [docs/AI_ASSISTANT_GUIDE.md](../../docs/AI_ASSISTANT_GUIDE.md) for workflow
4. [AGENTS.md](../../AGENTS.md) for UI work

Enforced by `.cursor/rules/project-context.mdc`.

## Bug-fix lifecycle (compressed)

For bugs and regressions:

1. Reproduce on reported platform
2. Trace: route → hook → action → mapper → component ([docs/MODULE_GUIDE.md](../../docs/MODULE_GUIDE.md))
3. Root cause before fix — minimal diff
4. Verify via [docs/TESTING_AND_QA.md](../../docs/TESTING_AND_QA.md)
5. Use `.cursor/skills/bug-fix-investigation/SKILL.md` when stuck

## Mandatory Behavior

- Think before coding.
- Never skip planning for module/system-level work.
- Validate before marking complete.
- Prefer scalable, maintainable solutions.
- Avoid hacks, shortcuts, and temporary fixes.
- If a better approach exists, propose it and confirm with the user first.

## Task Size Gate

- **Small task**: local, low-risk, no architecture decision.
  - Lifecycle may be compressed.
- **Major task**: module/system-level, cross-cutting behavior, architecture decisions, or significant risk.
  - Full lifecycle is required.

When uncertain, treat the task as major.

## Product Context Gate (Required for Major Tasks)

Before implementation:

1. Review relevant ClickUp task(s).
2. Review all linked UI/UX references.
3. Review existing product behavior (if available).
4. Build parity map (current vs target behavior).

Do not skip this gate.

### Reference screenshot gate

When screenshots or exact-match requests are present:

- Apply `.cursor/rules/reference-ui-parity.mdc` and `.cursor/skills/screenshot-ui-clone/SKILL.md`.
- Build Reference Parity Inventory before coding.
- Skip creative UX proposals and pre-implementation confirmation unless the user asks for improvements.
- Complete Reference Parity Checklist before marking done.

## Lifecycle Enforcement

For major tasks, follow this order:

1. **PLANNER**
   - Define scope, constraints, risks, and acceptance criteria.
   - Define product/UX behavior contract (flows, states, interactions).
   - Include parity checklist from references and current behavior.
   - Include:
     - Root Cause
     - How To Fix
     - What To Change
   - Share current-look review and suggested improvements.
   - Get confirmation before implementation.

2. **DEVELOPER**
   - Use strict TypeScript and modular architecture.
   - Reuse shared components first where applicable.
   - Avoid duplicate logic.
   - Keep clear naming and split large files by responsibility.
   - Preserve behavior parity unless user approves deviation.

3. **QA**
   - Validate edge cases, navigation, and state regressions.
   - Always validate loading/empty/error states.
   - Validate UX quality:
     - keyboard handling
     - responsive behavior
     - interaction states
     - spacing/typography consistency
     - form usability + validation timing

4. **REVIEWER**
   - Review as Staff Engineer.
   - Evaluate performance, scalability, maintainability.
   - Validate UX/flow parity and product behavior integrity.
   - Fix issues immediately, re-test, and report residual risk.

## UI Rules

- Keep spacing and typography consistent with design system.
- Use reusable components.
- Do not use inline styles; use theme-driven styling.
- Always handle loading/empty/error states.
- Match reference behavior/hierarchy before style variations.
- When reference screenshots exist: parity over premium interpretation (`reference-ui-parity.mdc`).
- Maintain enterprise SaaS quality bar.

## Auto-Fix Rule

If issue found:

1. Fix immediately.
2. Re-test impacted paths.
3. Confirm no broken logic remains.

## Confirmation Rule

Proceed autonomously by default.
Ask user only if:

- Multiple architecture choices are materially different.
- Requirements are unclear.
- Major deviation is necessary.
- Improvement changes expected behavior contract.
