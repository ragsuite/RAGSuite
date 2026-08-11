# Web ↔ Mobile Parity Matrix

> Contract between the **legacy Vite SPA** (`/Users/arun/Desktop/RAGSUITE/frontend`) and RAGSuite Mobile (Expo).  
> **In scope:** active legacy web features only. **Excluded:** commented or mock web code (see appendix).  
> **Not the same as** backend API gap tracking — for backend compatibility see [BACKEND_COMPATIBILITY.md](./BACKEND_COMPATIBILITY.md) and [BACKEND_API_CONTRACT.md](./BACKEND_API_CONTRACT.md).

## Status legend

| Status | Meaning |
|--------|---------|
| PASS | Feature parity achieved |
| GAP | Known gap — tracked below |
| EXCLUDED | Intentionally not implemented (commented/mock on web) |
| N/A | Platform-specific; not required on other platform |

---

## Module matrix

| Module | Web route | Mobile route | API prefix | Status |
|--------|-----------|--------------|------------|--------|
| Analytics | `/` | `/(app)/(tabs)/index` | `/api/v1/overview`, `/analytics/*` | PASS |
| Projects | `/projects` | `/(app)/projects` | `/api/v1/projects` | PASS |
| Crawl — domain | `/crawl` | `crawl-management` tab | `/api/v1/crawl/*` | PASS |
| Crawl — documents | `/crawl` | `crawl-management` tab | `/api/v1/documents` | PASS |
| Crawl — Gmail | `/crawl` | `crawl-management` tab | `/api/v1/gmail/*` | PASS |
| Crawl — Google Drive | `/crawl` | `crawl-management` tab | `/api/v1/connectors/google_drive/*` | PASS |
| Crawl — Notion | `/crawl` | `crawl-management` tab | `/api/v1/connectors/notion/*` | PASS |
| Documents legacy | `/documents` → `/crawl` | `/(app)/documents` → redirect | — | PASS |
| Chatbot config | `/chatbot-configuration` | tab + `chatbot-config/*` | `/api/v1/chatbot/*` | PASS |
| Search config | `/search-configuration` | tab + `search-config/*` | `/api/v1/search/*` | PASS |
| Compare models | `/compare-models` | `/(app)/compare-models` | `/api/v1/compare-models/*` (+ `/search/compare` streams) | PASS |
| History | `/history` | `/(app)/history` | `/api/v1/chat/history` | PASS |
| Configuration | `/configuration` | `/(app)/configuration` | `/api/v1/api-keys`, `/n8n/*` | PASS |
| Feedback | `/feedback` | `/(app)/feedback-moderation` | `/api/v1/feedback/*` | PASS |
| System health | `/system-health` | `/(app)/system-health` | `/api/v1/system-health` | PASS |
| Audit logs | `/audit-logs` | `/(app)/audit-logs` | `/api/v1/audit-events` | PASS |
| Profile | `/profile` | `/(app)/profile` | `/api/v1/user/*` | PASS |
| Settings (org) | `/settings` | `/(app)/(tabs)/settings` + `settings/*` | `/api/v1/settings` | PASS |
| Notifications | Navbar bell | header + `/notifications` | `/api/v1/notifications` | PASS |
| Onboarding | `/onboarding` | `/(app)/onboarding` | `/api/v1/onboarding/*` | PASS (2-step) |
| Auth — sign in | `/login` | `/(auth)/sign-in` | `/api/v1/crawl/auth/login` | PASS |
| Auth — register | `/signup` | `/(auth)/register` | `/api/v1/crawl/auth/register` | PASS |
| Auth — verify email | `/verify-email` | `/(auth)/verify-email` | verify-email | PASS |
| Auth — check email | `/check-email` | `/(auth)/check-email` | resend-verification | PASS |
| Auth — forgot password | `/forgot-password` | `/(auth)/forgot-password` | UI only until API | PASS |
| Auth — 2FA | login flow | `/(auth)/verify-2fa` | verify-2fa | PASS |
| Integrations mock | `/integrations` | — | mock | EXCLUDED |
| Profile notifications tab | Profile | — | — | EXCLUDED |
| Profile privacy tab | Profile | — | — | EXCLUDED |
| Web integrations mobile SDK card | IntegrationsTab | deprioritized routes | — | EXCLUDED |

---

## Excluded features (do not implement)

| Reference | Reason |
|-----------|--------|
| `Profile.tsx` notifications/privacy tabs | Commented out on web |
| `ChatbotConfiguration/IntegrationsTab.tsx` mobile block | Commented “temporarily hidden” |
| `SearchConfiguration/IntegrationsTab.tsx` mobile block | Same |
| `ChatbotConfiguration.tsx` / `SearchConfiguration.tsx` `mobileScript` state | Commented |
| `Integrations.tsx` `mockIntegrations` | Mock data; not in sidebar |

| Floating widget | EmbeddableWidget | AppChatWidgetHost | PASS |
| Command palette | ⌘K / header search | CommandPaletteSheet | PASS |
| Help system | HelpSystem modal | HelpSystemModal | PASS |
| Onboarding tour | OnboardingTour | OnboardingTourModal | PASS |
| Page error retry | crawlRemountKey | PageErrorBoundary + remount key | PASS |

---

## Motion parity checklist

| Behavior | Web reference | Mobile target | Status |
|----------|---------------|---------------|--------|
| Page enter | opacity + y 10px, 200ms easeInOut | `AnimatedScreen` FadeInDown 200ms | PASS |
| Sidebar collapse | 300ms transition | drawer width CSS transition 300ms | PASS |
| Button press | `active:scale-95` | header `motion.pressScale` | PASS |
| Modal / sheet | fade + zoom 95%, 200ms | `AnimatedSheet` | PASS |
| Reduced motion | CSS prefers-reduced-motion | `useReducedMotion()` | PASS |

---

## Surface parity

All platforms resolve radii via `useAppTheme().surfaceRadius` (`resolveSurfaceRadius` in [`src/theme/resolve-surface-radius.ts`](../src/theme/resolve-surface-radius.ts)). Web reference `LayoutContext` and mobile now share **2px** clear-edge surfaces.

### Surface radius policy

| Context | card | modal | button | input |
|---------|------|-------|--------|-------|
| **All platforms** (web wide, web compact, iOS, Android) | 2px | 2px | 2px | 2px |

**Rules**

- Use `surfaceRadius.*` for panel cards, dialogs, primary controls, and inputs.
- Use `getPanelSurfaceRadius` / `getControlSurfaceRadius` when a helper is clearer than inline `surfaceRadius.*`.
- Use `isWebParitySurfaces` for tab **colors** and layout — not for radius branching.
- Pill badges / status chips keep `radius.pill` / 999 — do not remap.
- Avatars, progress tracks, typing dots, and chart legend dots may stay circular.

`componentRadius` is a deprecated alias of `surfaceRadius` for incremental migration.

| Token | All platforms |
|-------|---------------|
| Panel / card shells | 2px |
| Modals / bottom sheets | 2px |
| Primary buttons / inputs | 2px |

**Shared surfaces**

- `AppCard` + `PageSectionHeader` — default card shell / section chrome (`PageSectionHeader` `page` variant only on web wide)
- `FormCard` — thin wrapper over `AppCard` + `AppCardContent`
- `AdaptiveOverlay` / `AdaptivePopover` — modal and anchored menu consistency
- `getWebParityTabStyle` / `getWebParityNavItemStyle` — [`web-parity-tab-styles.ts`](../src/shared/components/surfaces/web-parity-tab-styles.ts)

### Tab chrome (wide web only)

Horizontal tab rows use `getWebParityTabStyle(active, pressed, { colorMode })` where `colorMode` comes from `useAppTheme().mode`.

| Theme | Active tab | Inactive tab |
|-------|------------|--------------|
| **Light** | `colors.primary` bg, `colors.textOnPrimary`, primary border | `colors.surface`, `colors.border`, `colors.text` |
| **Dark** | `colors.surfaceMuted`, `colors.border`, `colors.text` (neutral) | same as inactive today |
| Pressed (either) | `colors.surfaceMuted` when inactive | — |
| Radius | `surfaceRadius.button` (2px) | |

**Sidebar sub-nav** (training/settings): use `getWebParityNavItemStyle` — always neutral active (`surfaceMuted` + border), not primary fill.

On native and compact web, keep filled-primary tab colors; radius is still `surfaceRadius.button` (2px).

### Layout hierarchy (wide web)

Match reference page structure:

1. **Page header** — `PageSectionHeader` (`page`: 30px / 700 + subtitle) or `compactPage` (24px / 600) on History + Feedback
2. **Filters / toolbar** — standalone row **or** `AppCard` with `compact` padding (`p-4`) for Audit, History, Feedback
3. **Data card / list shell** — bordered shell with `getPanelSurfaceRadius` + muted **section header band** (`surfaceMuted` + bottom border) before rows
4. **Embedded panel titles** — `PageSectionHeader` `section` (24px / 700), e.g. API keys inside Configuration (`ConfigurationPanelCard` `titleVariant="section"`)

Examples:

- Projects — toolbar above list `AppCard`
- Crawl — filters above domain panel card; primary icon refresh in header
- Analytics — KPI row → chart cards
- Audit — Shield icon + page header; filters in `AppCard`; table below (`max-width` 1400px centered)
- History / Feedback — `compactPage` header → KPI (Feedback) → filter `AppCard` → list shell with banded section header
- System health — page header + borderless primary icon refresh (matches Projects)

**Never** use `radius.md` / `radius.lg` on dashboard panel shells — use `surfaceRadius.card` or `getPanelSurfaceRadius(...)`.

### Typography (wide web)

| Element | Spec |
|---------|------|
| Page h1 | 30px / 700 (`PageSectionHeader` `page`) — Projects, Crawl, Configuration, Audit, Profile, Notifications |
| Compact page h1 | 24px / 600 + 14px subtitle (`PageSectionHeader` `compactPage`) — History, Feedback |
| Section h2 | 24px / 700 (`PageSectionHeader` `section`) — embedded panels, list section bands |
| Card title | 16px / 600 (`AppCardTitle`) |
| Card padding | 24px (`spacing.lg` in `AppCardHeader` / `AppCardContent`) |
| `AppCard` `compact` on wide web | Horizontal/top padding stays `spacing.lg`; header bottom uses `spacing.sm` (reference `pb-3`) |
| Table header row | uppercase muted labels, **48px** min height (Crawl, Configuration API keys, Audit logs) |
| KPI cards | `p-6` padding, label 14px/500, value 24px/700 |

### Regression guard (pre-merge)

After any `useAppTheme()` edit in a feature file, grep the file for:

- `radius.` / `typography.` / `surfaceRadius.` / `isWebParitySurfaces` — ensure each is destructured from `useAppTheme()`
- Variables declared inside `Pressable` `style` callbacks that are also referenced in JSX children (hoist to component scope)

**Smoke:** Configuration (API keys + n8n), Chatbot Settings nav, Compare Models saved configs load without `PageErrorBoundary`.

### Platform QA matrix (surfaces)

| Surface | iOS/Android | Web ≥900 | Web &lt;900 |
|---------|-------------|----------|-------------|
| Primary buttons | 2px radius, 44px min height | 2px radius | 2px radius |
| Panel cards | 2px radius | 2px radius | 2px radius |
| Bottom sheets | 2px radius | compact sheet fallback | bottom sheet |
| Page headers | Shell chrome only | `PageSectionHeader` page | compact header |

---

## QA sign-off

Run per [TESTING_AND_QA.md](./TESTING_AND_QA.md) and [QA_ONBOARDING.md](./QA_ONBOARDING.md).

### Per release gate

```bash
yarn lint
yarn test
yarn tsc --noEmit
```

### Manual matrix

- [ ] Web breakpoints: 1280, 900, 720, mobile width
- [ ] Onboarding: 2 steps only (branding → project → complete)
- [ ] Crawl: all 5 tabs (domain, document, gmail, google-drive, notion)
- [ ] Drive/Notion OAuth on web + physical device
- [ ] Auth: register → check-email → verify flow
- [ ] Command palette / help / tour on first login
- [ ] Active project switch invalidates project-scoped data

---

## Related docs

- [PRODUCT.md](./PRODUCT.md) — routes and navigation
- [MODULE_GUIDE.md](./MODULE_GUIDE.md) — per-module entry points
- [QA_ONBOARDING.md](./QA_ONBOARDING.md) — onboarding QA
