# Code Conventions

> Senior-engineer standards for this codebase. Brand visuals are in [AGENTS.md](../AGENTS.md) — not duplicated here.

## Imports

- Use `@/` path alias only: `import { X } from '@/features/crawl/...'`
- No deep relative imports like `../../../shared/`

## Feature module layout

Each domain under `src/features/<name>/`:

```text
components/     # UI pieces
hooks/          # useXxx hooks, providers
services/       # Optional service layer
utils/          # Mappers, helpers, layout constants
types/          # TypeScript types
screens/        # Full-screen compositions (optional)
```

Network calls live in `src/network/actions/<domain>.actions.ts`, not inside components.

## Naming

| Kind | Convention | Example |
| ---- | ---------- | ------- |
| Feature folder | kebab-case | `chatbot-config/` |
| Component file | PascalCase | `CrawlDocumentPanel.tsx` |
| Hook file | camelCase `use*` | `useCrawlManagement.ts` |
| Actions file | `<domain>.actions.ts` | `crawl.actions.ts` |
| Mapper | `*-mapper.ts` / `*-api-mappers.ts` | `crawl-api-mappers.ts` |
| Route file | kebab-case | `chat-widget-customization.tsx` |

## Shared UI catalog (reuse first)

| Component | Path | Use for |
| --------- | ---- | ------- |
| `AppSelectField` | `src/shared/components/app-select-field.tsx` | Inline/sheet/web-anchored selects |
| `AppTextField` | `src/shared/components/app-text-field.tsx` | Text inputs |
| `AppButton` | `src/shared/components/app-button.tsx` | Typed CTA / primary / secondary / outline / ghost / danger (+ `icon` / `iconOnly`) |
| `AppSecondaryButton` | `src/shared/components/app-secondary-button.tsx` | Alias → `AppButton variant="outline"` |
| `AppColorField` | `src/shared/components/app-color-field.tsx` | Color pickers |
| `ConfigurationPanelCard` | `src/features/configuration/components/ConfigurationPanelCard.tsx` | Config section cards |
| `CrawlPanelCard` | `src/features/crawl/components/CrawlPanelCard.tsx` | Crawl list panels |
| `CrawlMobileFilterSection` | `src/features/crawl/components/CrawlMobileFilterSection.tsx` | Search + filter toolbar row |
| `CrawlSearchField` | `src/features/crawl/components/CrawlSearchField.tsx` | Toolbar search |
| `CrawlFilterSelect` | `src/features/crawl/components/CrawlFilterSelect.tsx` | Crawl filter dropdowns |
| `TableHeaderLabel` | `src/shared/components/brand/` | Uppercase table headers |
| `StatePanel` | `src/shared/components/dashboard/state-panel.tsx` | Empty/loading wrapper |
| `SectionCard` | `src/shared/components/dashboard/section-card.tsx` | Generic section cards |
| `ConfigurationSheet` | `src/features/configuration/components/ConfigurationSheet.tsx` | Modal sheets |

**Do not** parallel-implement the same pattern under a new name.

### AppButton variants (web + mobile)

Use one component — do not invent parallel filled `Pressable` CTAs.

| Variant | Look | Use |
| ------- | ---- | --- |
| `cta` | Bright pine fill (default) | One strongest action per region (Sign in, Create, Submit) |
| `primary` | Darker pine fill | Strong filled action that is not the hero CTA |
| `secondary` | Muted fill + border | Soft alternative to outline |
| `outline` | Surface + border | Cancel, Discard, secondary text actions (`AppSecondaryButton`) |
| `ghost` | Transparent, pine label | Tertiary text actions |
| `danger` | Danger fill | Destructive confirms |

Also: `icon` for leading icon; `iconOnly` for square toolbar controls (prefer `variant="outline"` for refresh/export). Label weight is always **600**.

| Size | Height | Use |
| ---- | ------ | --- |
| `compact` (default) | 44 | Dashboard, settings, sheets, toolbars, headers |
| `default` | 48 | Auth + onboarding full-width form CTAs only |
| `dense` | 40 | Deprecated for AppButton — prefer `compact` |

Out of scope for this contract: table row icon actions, nav chrome, tabs/chips, chat widget (follow-up).

## Layout and toolbar

| Constant / hook | Location | Purpose |
| --------------- | -------- | ------- |
| `ActionIcons` | `src/shared/constants/action-icons.ts` | Canonical Lucide CRUD/toolbar icons — run `yarn check-action-icons` |
| `TOOLBAR_CONTROL_HEIGHT` (44) | `src/shared/constants/layout.ts` | Search + inline select height |
| `COMPACT_LAYOUT_BREAKPOINT` (900) | `src/shared/constants/layout.ts` | Web compact vs wide |
| `useCrawlLayout` | `src/features/crawl/hooks/useCrawlLayout.ts` | Crawl breakpoints, table scroll |
| `useChatbotConfigLayout` | `src/features/chatbot-config/hooks/useChatbotConfigLayout.ts` | Chatbot settings layout |
| `useConfigurationLayout` | `src/features/configuration/hooks/useConfigurationLayout.ts` | Configuration layout |

Toolbar rows: `alignItems: 'stretch'`; pass `controlHeight={TOOLBAR_CONTROL_HEIGHT}` to inline `AppSelectField`.

## API pattern

```text
Screen → hook → *.actions.ts → request.ts → API
                ↓
            *-mapper.ts → typed state → components
```

- Endpoints: `src/network/apiUrl.ts` (`API_CONFIG`)
- Errors: `src/utils/api-error.ts`, axios interceptor in `request.ts`
- Never log tokens or API key secrets

## i18n

- All **admin chrome** strings: `const { t } = useTranslation();` then `t('module.key')`
- Keys live in `src/i18n/locales/en.ts`
- Run `yarn sync-i18n` after adding keys
- **Product language (widget / search-box):** do **not** use dashboard `useTranslation()` for chatbot feedback forms or search-test feedback. Use `createTranslatorForLanguage` / `translateForLocale` from `src/i18n/translate-for-locale.ts` with `config.language` or search-box language (`en-us` → `en`, `pt-br` → `pt`, `zh-cn` → `zh`, etc.)

## Shared switches / assignment sheets

- `AppSwitchRow` paints `colors.surface` by default. On `primaryTint` / `surfaceMuted` parents, pass `transparentBackground` or nested white “card in card” appears.
- Prefer hairline dividers over per-row bordered boxes for module lists inside a muted section.

## Brand and theme

- Colors, fonts, spacing: `tokens/design-tokens.json`, `src/theme/brand-tokens.ts`, `useAppTheme()`
- **Never hardcode hex** outside the token system
- Typography: Fraunces (display), Hanken Grotesk (UI), IBM Plex Mono (eyebrows/IDs)
- Tabular lining numerals for metrics

## Web-specific pitfalls

1. **Nested buttons:** `Pressable` with `accessibilityRole="button"` renders `<button>` on web. Do not nest pressables — use sibling layout (see `CrawlDocumentCard.tsx`).
2. **Platform branches:** `Platform.OS === 'web'` for drawer type, storage, layout
3. **calc() widths:** Use `ViewStyle` cast when using CSS calc in grid layouts

## State management

- Feature hooks + React context providers — no Redux
- Domain providers: `ChatbotConfigProvider`, `SearchConfigProvider`, `ConfigurationProvider`, `ActiveProjectProvider`
- Compose in `src/providers/app-providers.tsx`

## Comments

- Code should be self-explanatory
- Comment only non-obvious business logic

## Related docs

- [AGENTS.md](../AGENTS.md) — brand contract
- [MODULE_GUIDE.md](./MODULE_GUIDE.md) — per-feature entry points
- `.cursor/rules/reference-ui-parity.mdc` — screenshot matching
