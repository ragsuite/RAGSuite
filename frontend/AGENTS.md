# AGENTS.md — RAGSuite Dashboard Brand System

> **Workspace note:** This brand contract applies to this repo `frontend/`. Backend is `../backend`. Prefer root `npm start` for the full stack (API `:9090`, web `:9191`). Never edit sibling clones `/Users/arun/RAGSuite_backend` or `/Users/arun/mobile-ragsuite`.


> **For the coding agent reading this:** This file is your contract for styling the RAGSuite
> product dashboard. Treat every value here as **locked** — do not invent colours, fonts,
> radii, or spacing, and do not "modernise" the look. Machine-readable tokens live in
> `tokens/design-tokens.json`; ready-to-use CSS variables in `tokens/tokens.css`; an optional
> Tailwind preset in `tokens/tailwind-preset.js`; reference component CSS in `tokens/components.css`.
> When in doubt, prefer the token files over your own judgement.

**Product:** RAGSuite — *The Sovereign Enterprise AI Platform* · *an innovation by NITSAN*
**Art direction:** **Warm Editorial Sovereignty** — intelligence shown through restraint, not spectacle. Warm like the Anthropic/Claude register, but unmistakably ours via a sovereign-green accent and a citation motif.
**One-line goal:** the dashboard should feel like a calm, well-typeset engineering instrument you stay in control of — not a neon SaaS app.

---

## 0. How to apply this (quickstart for the agent)

1. Load fonts: **Fraunces** (400, 500), **Hanken Grotesk** (400–700), **IBM Plex Mono** (400, 500). Self-host or Google Fonts.
2. Import `tokens/tokens.css` at the app root (or wire `tokens/design-tokens.json` into your build / `tokens/tailwind-preset.js` if you use Tailwind).
3. Map **all** colours, fonts, spacing, and radii to these tokens. Never hard-code a hex outside the palette.
4. Build components to the specs in §5. Reference CSS is in `tokens/components.css`.
5. Run the §8 pre-flight checklist before you call it done.

**Five non-negotiable rules**

1. Warm paper canvas, warm near-black ink (**never `#000`**), one sovereign-green accent. No dark-neon, no gradients, no glassmorphism.
2. **Prefer hairline borders to shadows.** Shadows are minimal and reserved for genuinely floating things (menus, popovers).
3. **Ochre is a graphic accent only** — citation chips, the citation motif, rules. Never use it for paragraph/body text.
4. **Never rely on colour alone.** Every badge and status carries text and/or an icon (accessibility + colour-blind safe).
5. **Tabular lining numerals for all numbers** — metrics, prices, table data, timestamps.

---

## 1. Colour

Use the tokens; do not pick new values. (HEX here for reference; canonical values in `tokens/`.)

| Token | Hex | Where it goes in the dashboard |
|---|---|---|
| `--paper` | `#F4F1EA` | App canvas / page background (warm linen) |
| `--paper-raised` | `#FBFAF6` | Cards, panels, modals, popovers |
| `--paper-sunken` | `#EDE8DC` | Sidebar, table header row, subtle fills, code caption |
| `--ink` | `#1B1A17` | Primary text & headings — warm near-black, **never `#000`** |
| `--ink-soft` | `#57544C` | Secondary text, labels |
| `--ink-faint` | `#6E6A5C` | Captions, meta, placeholder, disabled |
| `--pine` | `#1E3A30` | Dark sidebars/sections, primary-button hover |
| `--pine-deep` | `#16271F` | Top utility bar, code blocks, CTA bands (darkest) |
| `--pine-bright` | `#2E6A4E` | Primary buttons, links, focus ring, active nav |
| `--pine-tint` | `#E7EDE7` | Selected/active row, soft wash, check chip |
| `--ochre` | `#B6802E` | **Graphic accent only** — citation/verification, Beta |
| `--ochre-tint` | `#F1E7D2` | Citation chip fill, Beta badge fill |
| `--hairline` | `#DED7C7` | 1px borders, dividers (default) |
| `--hairline-strong` | `#C9C0AC` | Emphasis borders, input borders |
| `--success` | `#2E6A4E` | Healthy / verified (reuses pine-bright) |
| `--warning` | `#B6802E` | Beta / caution (reuses ochre) |
| `--error` | `#A23B2E` | Errors — warm brick, **never pure red** |

**Rules:** ink is warm near-black, never `#000`. Dark surfaces use `--pine` / `--pine-deep`, **never charcoal grey**. Greens read as *verified / secure / European-calm* — that separates us from Anthropic's clay and the competitor field's cool blues. Keep that signal protected by using green with discipline.

---

## 2. Typography

Three open-source families (fitting for an open-core product; all handle German well). Fallback ladders are baked into the font tokens.

| Role | Family / weight | Use in dashboard |
|---|---|---|
| **Display** | **Fraunces** 400/500 | Page titles, big metric numbers, empty-state headlines. Tight tracking. |
| **Text / UI** | **Hanken Grotesk** 400/500/600/700 | The workhorse — all UI text, body, buttons, labels, table cells. |
| **Mono** | **IBM Plex Mono** 400/500 | Eyebrows, labels, table headers, IDs, citations, metadata, code, timestamps. Signals "engineered + open". |

**Type scale** (see `design-tokens.json` for exact values): Display L for page titles; Heading M/S (Hanken 600) for sections and card titles; Body M (1rem, lh 1.6) default; Body S (0.875rem) for table cells/captions; Eyebrow (mono, UPPERCASE, 0.08em tracking) above headings; Citation (mono 0.8125rem) for source/meta lines.

**Rules:** headlines in Fraunces, sub-heads in Hanken (rhythm; avoids serif overload). Body measure 64–72ch max. **Tabular lining numerals everywhere there are numbers.** Eyebrows are mono + uppercase, often paired with a small lock/citation glyph.

---

## 3. Spacing, grid, shape

- **Base unit 4px.** Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
- **Content max 1200px**; text blocks ~680px (68ch). Suggested sidebar rail ~260px.
- **Radius:** 8px (buttons, inputs, small), 12px (cards), 16px (large panels/modals). **Pills only for badges/tags** — not pill-everything.
- **Borders & elevation:** 1px `--hairline` is the default separator. Shadows are minimal — `--shadow-resting` for resting cards, `--shadow-raised` only for genuinely floating UI. **Prefer a border to a shadow.**
- **German headroom:** never fix button / nav / column widths tightly — design for ~30% text expansion and long German compounds.
- **Density:** dashboards can be denser than the marketing site, but keep whitespace generous — whitespace is the brand. Don't cram.

---

## 4. Imagery, icons, motion

- **Icons:** thin line, **1.5px stroke**, consistent radius, monochrome ink/pine. (Lucide/Phosphor line sets fit; recolour to ink/pine.)
- **No** stock office photos, **no** generic 3D blobs/abstract renders, **no** neon, **no** glossy floating screenshots.
- **Motif family:** **lock + document + check** — sovereignty + citation + verification. Reach for these before generic icons.
- **Diagrams** (topology / data-flow): line style, blueprint-calm — reinforces "your infrastructure, no phone-home."
- **Motion (sparingly):** scroll/route reveal = fade + rise 8–12px, ~280ms ease-out, once. Hover = 120–160ms colour / 1–2px translate. **The one signature animation:** a citation chip "verifies" on entry (scale 0.96→1 + fade, ~200ms) — use rarely. **Banned:** parallax, autoplay carousels, looping gradients, bouncy springs, count-up vanity stats. Always honour `prefers-reduced-motion`.

---

## 5. Core dashboard components

Reference CSS for each is in `tokens/components.css`. Adapt class names to your framework; keep the tokens, sizes, and behaviour.

- **Primary button** — `--pine-bright` fill, white text, Hanken 600, radius 8px, 44–52px tall; hover → `--pine` + translateY(−1px), 140ms.
- **Secondary button** — paper, 1px `--ink` border, ink text; hover → `--paper-sunken`.
- **Tertiary / link** — `--pine-bright`, thin underline (3px offset); mono "→" for forward actions.
- **Eyebrow label** — mono uppercase + optional lock/citation glyph; sits above section headings.
- **Card** — `--paper-raised`, 1px hairline, radius 12px, 24–32px padding; optional 2px top accent rule in pine for emphasis.
- **Inputs / selects** — `--paper-raised` fill, 1px `--hairline-strong` border, radius 8px, 44px min height; focus → `--pine-bright` border + focus ring. Placeholder in `--ink-faint`.
- **Sidebar nav** — `--paper-sunken` rail, hairline divider; items in `--ink-soft`; hover → `--pine-tint`; **active item** → `--pine-tint` bg + `--pine-bright` text + 2px inset pine left-marker (`aria-current="page"`).
- **Top utility bar** (optional) — `--pine-deep`, mono ~0.74rem; brand-merge line / account / DE-EN.
- **Data table** — mono uppercase header on `--paper-sunken`; rows separated by 1px hairline; numeric cells right-aligned + tabular numerals; selected row `--pine-tint` (`aria-selected="true"`).
- **Metric / KPI tile** — big number in **Fraunces** with tabular numerals + mono label; delta uses `--success` / `--error` with an arrow glyph (never colour alone).
- **★ Citation card / chip (SIGNATURE)** — a short answer with an inline numbered chip `[1]` (mono, `--ochre-tint` fill) and a source line: ochre dot + domain + path in mono `--ink-faint`. This is the literal "every answer cited / no hallucinations" proof — **the defining RAGSuite component.** Use it wherever the product surfaces a sourced AI answer.
- **CE / EE / Beta badges** (must stay accurate to the product's edition matrix): `Community` = pine **outline** pill · `Enterprise` = pine **filled** pill · `Beta` = **ochre outline** pill (always on **n8n** and the **mobile app**). Badges always carry text, never colour alone.
- **Code block** — `--pine-deep` surface, IBM Plex Mono, copy button (e.g. the one-line Docker quickstart).
- **Status / toast** — success `--success`, warning/Beta `--ochre`, error `--error` (warm brick); always paired with an icon + text label.
- **Charts/analytics** — pine family for primary series, ochre only for a "verified/highlight" series; hairline gridlines on paper; tabular numerals on axes; no rainbow palettes.

---

## 6. Voice in the UI (microcopy)

Confident, concrete, calm. Short declaratives. Specifics over adjectives. Predictability over hype.

| Do | Don't |
|---|---|
| "Runs entirely on your infrastructure. No phone-home." | "Revolutionary AI that changes everything." |
| "Citations on every answer. No hallucinations, just facts." | "Magical, next-gen experiences." |
| State **Beta** plainly on n8n + mobile. | Imply Beta features are production-ready. |
| Open source = inspectable, no lock-in. | Open source = "free". |
| No exclamation marks; no urgency theatre. | "Hurry!", "Amazing!", emoji-spam. |

**Product triad — always all three:** **AI Search, AI Assistant & AI Connectors.** Do **not** introduce "agents", "no-code agent builder", "AI workspace", or "deep document understanding" as feature labels in the UI (off-positioning / deferred). Widgets are how Search/Assistant are *published*, not a pillar.

**German (if localised):** formal **Sie** always; native German, never machine translation; mind ~30% text expansion in layout.

---

## 7. Accessibility (WCAG 2.2 AA — required)

- Contrast: body text ≥ 4.5:1, large text ≥ 3:1. The token pairs in §1 are chosen to meet this on paper / on pine.
- `:focus-visible` ring: 2px `--pine-bright`, 2px offset — visible on both paper and dark surfaces (see `--focus-ring` in tokens.css).
- Minimum touch/click target 44×44px.
- **Never rely on colour alone** — badges, statuses, chart series, and deltas all carry text or icons.
- Honour `prefers-reduced-motion: reduce` (disable transforms, keep opacity).
- Tabular numerals for all data/pricing.

---

## 8. Pre-flight checklist (run before shipping any screen)

1. Every colour, font, radius, and space comes from the tokens — no stray hex, no `#000`, no charcoal grey.
2. Fraunces for display/metrics, Hanken for UI/body, IBM Plex Mono for labels/data/code. Tabular numerals on all numbers.
3. Borders preferred over shadows; shadows only on floating UI.
4. Ochre used only as a graphic/citation accent, never as body text.
5. Citation chip/card used wherever a sourced AI answer appears.
6. CE/EE/Beta badges accurate and text-bearing; **Beta** present on n8n + mobile.
7. Focus rings, 44px targets, ≥4.5:1 contrast, reduced-motion honoured, no colour-only signals.
8. Microcopy on-voice (calm, concrete, no hype); product triad wording correct; no retired/deferred feature terms.
9. German (if present) is native and formal Sie; layout survives ~30% text expansion.

---

## 9. Where the deeper detail lives

- `brand/master-brand-guide.md` — the medium-agnostic parent brand system (logo, full colour incl. CMYK, type across media, print/email/social specs).
- `brand/website-style-guide.md` — the fullest token + component reference (the dashboard is closest to this; mirror it).
- `brand/voice-and-principles.md` — voice, tone, vocabulary, design principles, the 6-point pre-create check.
- `assets/logo/` — production logo files (see `README.md` for which is which).
- `tokens/` — `design-tokens.json`, `tokens.css`, `tailwind-preset.js`, `components.css`.

If any token here ever conflicts with the brand source docs, the **brand source docs win** — flag the conflict rather than guessing.
