# Testing and QA

> General verification bar for all work. Feature-specific onboarding cases: [QA_ONBOARDING.md](./QA_ONBOARDING.md).

## Automated checks

```bash
yarn lint
yarn test
yarn tsc --noEmit    # no NEW errors on touched files
```

**Reality:** Only 3 Jest unit tests exist today. UI and integration paths require **manual QA**.

## Bug-fix verification matrix

| Step | Action |
| ---- | ------ |
| 1. Reproduce | Confirm bug on reported platform (web / iOS / Android) |
| 2. Trace | Route → hook → action → mapper → component (see [MODULE_GUIDE.md](./MODULE_GUIDE.md)) |
| 3. Fix | Minimal diff; root cause addressed |
| 4. Regress | Re-test original repro + adjacent flows |
| 5. Console | Web: no new errors (especially nested `<button>` warnings) |
| 6. Types | `yarn tsc --noEmit` on touched files |

## UI QA checklist

### Breakpoints (web)

Test when layout/toolbar/table code changes:

- [ ] 1280px — wide desktop
- [ ] 1024px — laptop
- [ ] 900px — compact threshold (`COMPACT_LAYOUT_BREAKPOINT`)
- [ ] 720px — narrow / wrap behavior

### States (every changed screen)

- [ ] Loading / skeleton
- [ ] Empty state with helpful copy
- [ ] Error state with recovery action
- [ ] Success feedback where applicable
- [ ] Search/filter active vs cleared

### Toolbar alignment (web)

- [ ] Search field and inline selects share height (`TOOLBAR_CONTROL_HEIGHT` = 44)
- [ ] Filter row does not awkwardly wrap at 1024px
- [ ] Clear/filter actions vertically centered

### Reference parity (when screenshots provided)

- [ ] Reference Parity Inventory completed before coding
- [ ] Reference Parity Checklist all PASS or gaps documented
- [ ] See `.cursor/rules/reference-ui-parity.mdc`

## Auth and session regression

- [ ] Sign in / sign out
- [ ] 401 clears session and redirects to sign-in
- [ ] 2FA flow intact if auth touched
- [ ] Onboarding gate still works for new users
- [ ] Token persists across refresh (web localStorage / native SecureStore)
- [ ] `public-config` hides public signup when `registration_enabled` is false
- [ ] Web: Google SSO start → `/login/callback` → authenticated shell (ops: `FRONTEND_BASE_URL` + CORS)
- [ ] Native: SSO CTA hidden; password login unchanged
- [ ] Org admin: Organization nav visible; invite / role / deactivate / project assign / SSO save+test
- [ ] Non-admin: Organization nav hidden; `/organization` redirects away

## High-risk area checks

| Area | Minimum verification |
| ---- | -------------------- |
| API keys (configuration module) | Create, reveal, delete — no secret in logs |
| Model settings API key (search + chatbot) | Empty field when key saved; “API key saved” only if real marker; Test connection with invalid key fails; no false success |
| Crawl / documents | Upload, filter, bulk select, delete |
| Chat widget | Send message, stream, error on disconnect |
| Widget feedback language | Set chatbot language to `hi` / `de` — feedback form strings match that locale (not dashboard English) |
| Search Test feedback language | Set search-box language ≠ dashboard locale — feedback form matches search-box language |
| Org project assignments | Workspace + project toggles; no white nested switch cards; Save persists |
| Project reindex | Progress UI, cancel, completion state |
| Audit logs | List, filter, detail, export if touched |
| Notifications (web) | Delete All uses bulk API; no reliance on `Alert.alert` |

## Web console checks

- [ ] No `validateDOMNesting` / nested button warnings
- [ ] No duplicate React keys in lists
- [ ] No unhandled promise rejections from API calls

## Before marking done

- [ ] Lint passes
- [ ] Tests pass
- [ ] No unrelated files changed
- [ ] i18n keys synced if strings added
- [ ] Brand tokens respected (no rogue hex colors)

## Feature-specific appendices

| Doc | Scope |
| --- | ----- |
| [QA_ONBOARDING.md](./QA_ONBOARDING.md) | Onboarding wizard steps |
| [REVIEW_ONBOARDING.md](./REVIEW_ONBOARDING.md) | Onboarding architecture review notes |

## Related docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — setup and PR checklist
- [AI_ASSISTANT_GUIDE.md](./AI_ASSISTANT_GUIDE.md) — agent workflows
- `.cursor/skills/bug-fix-investigation/SKILL.md` — systematic debugging
