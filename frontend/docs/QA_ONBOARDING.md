# QA Onboarding Checklist

> **Feature-specific** — onboarding wizard only. For general QA bar, see [TESTING_AND_QA.md](./TESTING_AND_QA.md).

## Scope

- Onboarding flow: **Step 1 Branding**, **Step 2 Create Project** — matches web 2-step flow (no data-source crawl or quick-test steps in UI).
- Entry behavior for first authenticated session.

## Functional Cases

- Branding step blocks `Next` when organization name is empty.
- Branding updates live preview name and primary button color.
- Create Project blocks `Finish` if name/description are invalid.
- Description counter updates and stays <= 500.
- `Finish Setup` saves project, calls `completeOnboarding`, and redirects to app home.

## Navigation Cases

- `Back` from step 2 navigates to step 1.
- `Back` on step 1 remains disabled.
- First app entry after auth redirects to onboarding if not completed.

## Persistence Cases

- Draft state is saved while user edits onboarding.
- Restart app restores onboarding draft.
- Finish setup clears onboarding draft.

## Visual/UX Cases

- Mobile layout stacks preview over form.
- Desktop layout renders side-by-side preview and form.
- Header shows brand icon + `RAGSuite` + title + subtitle.
- Stepper shows **2 steps** with active and completed step states.
- Step transitions use page-enter motion (200ms) when reduced motion is off.

## Regression Cases

- Auth sign-in/up still functional.
- Drawer routing still functional.
- Onboarding tour can start after first login (separate from onboarding wizard).
- Lint and diagnostics pass with no errors in touched onboarding files.

## Out of scope (web parity decision)

- Step 3 data-source crawl and Step 4 quick test are **not** shown in mobile onboarding UI (service layer may retain crawl helpers for future use).
