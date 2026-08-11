# RAGSuite Website — Brand & Style Guide
*2026-06-13 · Art direction: "Warm Editorial Sovereignty" · Phase 1 creative foundation*

The reusable design language: tokens, type, components, motion, and voice. Built so that what we prototype in Claude Artifacts is consistent from the first hero to the last footer. The north star: **intelligence shown through restraint, not spectacle** — warm like Anthropic, but unmistakably its own through a sovereign-green accent and a citation motif.

---

## 1. Design principles
1. **Every element earns its place.** If it isn't doing a job (clarity, trust, or conversion), it's removed. Minimal is the rule, not a style.
2. **Editorial, not "app marketing."** Reads like a well-typeset document, not a SaaS template. Type and whitespace carry the page; decoration doesn't.
3. **Proof over adjectives.** Concrete specs, EUR figures, citations. DACH trust is earned with substance.
4. **One signature, protected.** The sovereign-green accent + the citation motif are our fingerprint. Used with discipline so they stay meaningful.
5. **Calm motion.** Micro-animation confirms or reveals; it never performs.

---

## 2. Color system

Warm paper canvas + warm ink + a **sovereign pine green** primary (deliberately *not* Anthropic's clay) + a sparingly-used **verification ochre** tied to the citation motif. Greens read as verified / secure / European-calm and separate us from both Anthropic (clay) and the competitor field (cool blues).

### Core tokens
| Token | Hex | Role | Text-safe? |
|---|---|---|---|
| `--paper` | `#F4F1EA` | Page background (warm linen) | bg |
| `--paper-raised` | `#FBFAF6` | Cards, raised surfaces | bg |
| `--paper-sunken` | `#EDE8DC` | Subtle fills, footer, code captions | bg |
| `--ink` | `#1B1A17` | Primary text, headlines | ✅ on paper (~14:1) |
| `--ink-soft` | `#57544C` | Secondary text | ✅ on paper (~6.5:1) |
| `--ink-faint` | `#6E6A5C` | Captions, meta (small ok) | ✅ on paper (~4.6:1) |
| `--pine` | `#1E3A30` | Brand deep, dark sections, hover | ✅ reversed (white ~12:1) |
| `--pine-deep` | `#16271F` | Darkest surface (CTA bands) | ✅ reversed |
| `--pine-bright` | `#2E6A4E` | Primary buttons, links | ✅ white on it (~6.3:1); as link on paper (~5.6:1) |
| `--pine-tint` | `#E7EDE7` | Soft green wash, selected states | bg |
| `--ochre` | `#B6802E` | Verification/citation accent **(graphic, not body text)** | large/bold only on paper (~3.1:1) |
| `--ochre-tint` | `#F1E7D2` | Citation chip fill | bg |
| `--hairline` | `#DED7C7` | 1px borders, dividers | line |
| `--hairline-strong` | `#C9C0AC` | Emphasis borders | line |

### Functional
| Token | Hex | Use |
|---|---|---|
| `--success` | `#2E6A4E` | Healthy/verified (reuses pine-bright) |
| `--warning` | `#B6802E` | Beta, caution (reuses ochre) |
| `--error` | `#A23B2E` | Errors (warm brick, never pure red) |

**Rules:** ink is near-black but *warm* — never `#000`. Prefer **hairline borders over shadows** (print/editorial feel). Ochre is a **graphic accent** (chips, rules, the citation motif), not a paragraph color. Dark sections use `--pine-deep`/`--pine`, never charcoal-gray.

---

## 3. Typography

Open-source families only — fitting for an open-core product, and all handle German well.

| Role | Family | Notes |
|---|---|---|
| **Display** (headlines) | **Fraunces** | Editorial serif with warmth + optical sizing. Weights 400/500. Tight tracking. *Calmer fallback if it ever feels too expressive: **Newsreader**.* |
| **Text / UI** | **Hanken Grotesk** | Humanist grotesk: precise, legible, friendly. Weights 400/500/600/700. The workhorse. |
| **Mono** | **IBM Plex Mono** | Eyebrows, labels, citations, metadata, code. Signals "engineered" and open. |

Fallback stacks: `Fraunces, Georgia, 'Times New Roman', serif` · `'Hanken Grotesk', -apple-system, 'Segoe UI', Roboto, Arial, sans-serif` · `'IBM Plex Mono', ui-monospace, Menlo, monospace`.

### Type scale (desktop; `clamp()` for fluid)
| Style | Family / weight | Size | Line-height | Tracking |
|---|---|---|---|---|
| Display XL (hero) | Fraunces 500 | `clamp(2.75rem, 5vw, 5rem)` | 1.02 | −0.02em |
| Display L (section) | Fraunces 500 | `clamp(2rem, 3.4vw, 3.25rem)` | 1.05 | −0.015em |
| Heading M | Hanken 600 | 1.5–1.75rem | 1.2 | −0.01em |
| Heading S | Hanken 600 | 1.25rem | 1.3 | 0 |
| Lead / Body L | Hanken 400 | 1.125–1.25rem | 1.6 | 0 |
| Body M (default) | Hanken 400 | 1rem–1.0625rem | 1.6 | 0 |
| Caption / Body S | Hanken 400 | 0.875rem | 1.5 | 0 |
| Eyebrow / label | IBM Plex Mono 500 | 0.75–0.8125rem | 1 | 0.08em, UPPERCASE |
| Citation / meta | IBM Plex Mono 400 | 0.8125rem | 1.4 | 0 |

**Rules:** headlines in Fraunces, sub-headings in Hanken (creates rhythm, avoids serif overload). Body measure **64–72ch max**. Use **tabular lining numerals** for all pricing and data. Eyebrows are mono + uppercase, often paired with a small lock/citation glyph.

---

## 4. Spacing, grid, shape
- **Base unit 4px.** Scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
- **Grid:** 12 columns, 24px gutters; content max **1200px**; text blocks max **~680px**. Desktop side margins ≥48px; mobile 20–24px.
- **Section rhythm:** 96–128px vertical desktop, 56–72px mobile. Let it breathe — whitespace is the brand.
- **Radius:** 8px (buttons, small), 12px (cards), 16px (large panels). Pills only for badges/tags. *Not* pill-everything.
- **Borders & elevation:** 1px `--hairline` default. Shadows minimal: `0 1px 2px rgba(27,26,23,.04)` resting, `0 10px 30px rgba(27,26,23,.06)` for genuinely raised. Prefer a border to a shadow.
- **German headroom:** never fix button/nav widths tightly — design for ~30% text expansion and long compounds.

---

## 5. Core components

- **Primary button** — `--pine-bright` fill, white text, Hanken 600, radius 8px, 44–52px tall; hover → `--pine` + translateY(−1px), 140ms.
- **Secondary button** — paper, 1px `--ink` border, ink text; hover → `--paper-sunken`.
- **Tertiary / link** — `--pine-bright`, thin underline (offset 3px); mono "→" for forward actions.
- **Eyebrow label** — mono uppercase + lock/citation glyph; sits above headings.
- **Card** — `--paper-raised`, 1px hairline, radius 12px, 24–32px pad; optional 2px top accent rule in pine.
- **★ Citation card (signature)** — a short answer with an inline numbered chip `[1]` (mono, `--ochre-tint` fill), and a source line: dot + domain + path in mono `--ink-faint`. This is the literal "every answer cited / no hallucinations" proof. Our defining component.
- **Trust bar** — single row of mono labels (`Apache 2.0` · `Self-hosted` · `DSGVO` · `EU-AI-Act-ready` · `No phone-home`) divided by thin rules; any logos in greyscale.
- **Feature row** — line icon (1.5px) + Heading S + concrete copy + one inline proof stat.
- **CE / EE / Beta badges (must stay accurate to `ce-ee-matrix.md`)** — `Community` = pine **outline** pill; `Enterprise` = pine **filled** pill; `Beta` = **ochre outline** pill (always on n8n + mobile app). Badges carry text, never color alone.
- **Pricing card** — four cards; EUR figure large in **Fraunces** with tabular numerals; "no per-seat creep" line; one CTA. Highlight a tier with a 1px pine border, *not* a loud fill.
- **Code block** — `--pine-deep` surface, IBM Plex Mono, copy button; used for the one-line Docker quickstart.
- **Nav** — paper with hairline underline; calm mega-menu (descriptors, not logo walls). **Footer** — `--paper-sunken`, mono section labels, complete sitemap + Impressum/Datenschutz + DE/EN + status.

---

## 6. Motion (sparingly, purposefully)
- **Scroll-in:** fade + rise 8–12px, 240–320ms ease-out, **once** per element.
- **Hover:** 120–160ms color / 1–2px translate.
- **The one signature animation:** a citation chip "verifies" on entry — scale 0.96→1 + fade, ~200ms. Use once or twice per page, never everywhere.
- **Banned:** parallax, autoplay carousels, looping background gradients, bouncy springs, count-up vanity stats.
- Always honor `prefers-reduced-motion: reduce` (disable transforms, keep opacity).
- **Test:** if an animation is decorative, cut it.

---

## 7. Imagery & iconography
- **No** stock office photos, **no** generic 3D blobs/abstract renders, **no** neon, **no** floating glossy screenshots.
- **Icons:** thin line, 1.5px stroke, consistent radius, monochrome ink/pine.
- **Product shots:** calm cropped UI fragments on paper inside a 1px hairline frame — like figures in a report, not hero glamour shots.
- **Diagrams:** self-host topology / data-flow drawn in line style (engineered, blueprint-calm) — reinforces "your infrastructure, no phone-home."
- **Texture:** optional 1–2% paper grain for a printed, human feel. Subtle.
- **Motif family:** lock + document + check — ties sovereignty, citation, and verification into one visual language.

---

## 8. Voice & tone

Confident, concrete, calm. Short declaratives. Specifics over adjectives. Predictability over hype.

| Do | Don't |
|---|---|
| "Runs entirely on your infrastructure. No phone-home." | "Revolutionary AI that changes everything." |
| "Citations on every answer. No hallucinations, just facts." | "Magical, intelligent, next-gen experiences." |
| "From €5,900 a year — one predictable invoice, no per-seat creep." | "Flexible pricing — contact us." |
| "Open source = inspectable, no lock-in." | "Open source = free." |
| State Beta plainly on n8n + mobile. | Imply Beta features are production-ready. |
| Name only competitor facts from the KB. | Make memory-based competitor claims. |

**German:** formal **Sie**; native DE for Home, Sovereignty, Security, Pricing, legal — never machine translation.

---

## 9. Accessibility (WCAG 2.2 AA)
- Contrast pairs as flagged in §2; body text ≥4.5:1, large ≥3:1.
- `:focus-visible` ring: 2px `--pine-bright`, 2px offset — visible on paper and on dark.
- Minimum touch target 44×44px.
- Never rely on color alone — badges and statuses carry text/icons.
- Honor `prefers-reduced-motion`. Tabular numerals for all data/pricing.

---

## 10. CSS custom-properties starter (paste into Artifacts)
```css
:root{
  --paper:#F4F1EA; --paper-raised:#FBFAF6; --paper-sunken:#EDE8DC;
  --ink:#1B1A17; --ink-soft:#57544C; --ink-faint:#6E6A5C;
  --pine:#1E3A30; --pine-deep:#16271F; --pine-bright:#2E6A4E; --pine-tint:#E7EDE7;
  --ochre:#B6802E; --ochre-tint:#F1E7D2;
  --hairline:#DED7C7; --hairline-strong:#C9C0AC;
  --success:#2E6A4E; --warning:#B6802E; --error:#A23B2E;
  --font-display:"Fraunces",Georgia,serif;
  --font-sans:"Hanken Grotesk",-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,Menlo,monospace;
  --maxw:1200px; --measure:68ch; --radius:12px; --radius-sm:8px;
}
/* Google Fonts: Fraunces (opsz,wght), Hanken Grotesk (400–700), IBM Plex Mono (400,500) */
```

---

## 11. Round 2 — co-brand & proof components (2026-06-13)

### Co-brand lockup
**RAGSuite by NITSAN.** Wordmark + a small mono `by NITSAN` (~0.6rem, `--ink-faint`, uppercase, baseline-aligned). RAGSuite is always primary and larger; NITSAN endorses, never dominates. **No TYPO3 visual cues** on RAGSuite materials (retired positioning) — the merge borrows NITSAN's enterprise credibility, not its agency identity.

### New components
- **Top utility bar** — `--pine-deep`, mono 0.74rem: brand-merge line + phone + email + social + DE/EN. A contact bar up top is standard DACH practice and signals "real company."
- **NITSAN stat band** — `--pine-deep` section, Fraunces stat numbers + mono labels: *since 2011 · 450+ projects · 35+ specialists · 3 German offices.*
- **Customer logo strip** — wordmarks set in Fraunces at `--hairline-strong`, hover → `--ink-soft`; honest attribution note beneath ("reflect NITSAN's client work"). Greyscale, uniform, never a colour logo soup.
- **Case-study card** — mono tag + Fraunces title + body + a hairline-topped footer with two metric figures (Fraunces, tabular numerals).
- **Review** — two rating cards (Google/Trustpilot, Fraunces score + ochre stars) + testimonial cards (ochre stars, Fraunces quote, initials avatar, name/role).
- **Trust-Center tile** — `--pine-tint` check chip + title + one-line policy statement.
- **Certification badge** — mono pill; **pine dot = held, ochre dot = pending/aligned**. Status encoded by colour *and* text, never colour alone.
- **Team card** — initials avatar (Fraunces, `--pine-tint`), name, RAGSuite-relevant role, mono email. **Lead variant**: 1.5px pine border + "Your first contact" (this is the Jürgen Pietschmann CTA anchor).
- **Office card** — pin glyph + city (Fraunces) + `<address>` + mono phone.

### Voice note (Round 2)
Lead the product line with the triad **"AI Search, AI Assistant & AI Connectors"** (Connectors = website crawl/upload, Gmail, MCP, n8n (Beta), Connector Marketplace — CE); retire the old "AI search and assistant" pair. Widgets are how Search/Assistant are *published*, not a pillar. Do **not** introduce "agents," "no-code agent builder," "AI workspace," or "deep document understanding" as feature claims — they conflict with locked CE/EE and deferred-feature guardrails (see strategy §10.5).

*Companion docs: `2026-06-13-strategy-and-ia.md` (structure) · `2026-06-13-competitor-dach-benchmark.md` (rationale). The live preview implements these exact tokens.*
