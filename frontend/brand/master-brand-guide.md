# RAGSuite — Master Brand Guide
*The medium-agnostic brand system. This is the parent; medium implementations inherit from it.*
*Web implementation: `../../20-marketing/website/2026-06-13-brand-style-guide.md` + the live Astro tokens. Voice: `voice-and-principles.md`. Positioning (locked): `positioning.md`.*

Art direction: **Warm Editorial Sovereignty** — intelligence shown through restraint. Warm like the Anthropic/Claude register, but unmistakably ours via a sovereign-green accent and a citation motif.

---

## 1. Logo system
**Direction: C — "Retrieve" (LOCKED 2026-06-13).** Stacked sources resolving into one cited answer (the ochre dot) — a literal picture of retrieval-augmented generation, tied to the citation motif. Files in `logo/`:
- `ragsuite-logo.svg` — primary horizontal lockup (light backgrounds)
- `ragsuite-logo-reversed.svg` — for pine/dark backgrounds
- `ragsuite-favicon.svg` — app-tile / favicon (pine square + answer lines + cite dot; legible at 16px)
- `ragsuite-cobrand-nitsan.svg` — "an innovation by NITSAN" lockup
- *Still to produce: stacked vertical lockup, mono-pine, mono-black/white, PNG @1×/@2×, `.ico`. The earlier `concept-a/b` SVGs can be deleted.*

- **Variations (required set):** primary lockup (symbol + "RAGSuite" wordmark) · symbol-only (favicon / app icon / avatar) · horizontal and stacked · one-colour (pine) · reversed (paper/white on pine or ink) · mono-black / mono-white for constrained print.
- **Co-brand:** "**an innovation by NITSAN**" lockup — RAGSuite always primary and larger; NITSAN endorses, never dominates. No TYPO3 cues (retired positioning).
- **Clear space:** minimum = the height of the symbol's cap, on all sides. **Min size:** symbol 24px / 8mm; full lockup 120px / 32mm wide.
- **Misuse (never):** recolour outside the palette, stretch/skew, add effects/shadows, rotate, place on busy imagery or low-contrast colour, recreate the wordmark in another typeface.
- **File formats:** SVG (master, web), PDF/EPS (print), PNG (raster, transparent, @1×/@2×), ICO/PNG favicon. Store in `logo/`.

## 2. Colour — full system
Screen uses HEX/RGB; print uses CMYK. CMYK values are calculated approximations — **proof on press and confirm with a designer for brand-critical print/Pantone**.

| Token | HEX | RGB | CMYK (approx) | Role |
|---|---|---|---|---|
| Paper | `#F4F1EA` | 244 241 234 | 0 / 1 / 4 / 4 | Background (screen). Print: leave unprinted or 4% warm tint. |
| Paper-sunken | `#EDE8DC` | 237 232 220 | 0 / 2 / 7 / 7 | Secondary surface |
| Ink | `#1B1A17` | 27 26 23 | 0 / 4 / 15 / 89 · *rich black: 50/40/40/100* | Primary text |
| Ink-soft | `#57544C` | 87 84 76 | 0 / 3 / 13 / 66 | Secondary text |
| Pine | `#1E3A30` | 30 58 48 | 48 / 0 / 17 / 77 | Brand deep, dark panels |
| Pine-bright | `#2E6A4E` | 46 106 78 | 57 / 0 / 26 / 58 | Primary action, links |
| Pine-tint | `#E7EDE7` | 231 237 231 | 3 / 0 / 3 / 7 | Soft green wash |
| Ochre | `#B6802E` | 182 128 46 | 0 / 30 / 75 / 29 | Verification/citation accent (graphic, not body text) |
| Hairline | `#DED7C7` | 222 215 199 | 0 / 3 / 10 / 13 | Rules, borders |

Rules: ink is **warm near-black, never `#000`**. Ochre is a graphic accent only (not paragraph text on paper). Prefer hairline borders to shadows. Dark surfaces use pine/pine-deep, never neutral grey.

## 3. Typography — the system across media
Three open-source families. The challenge is fidelity across web, office, and email — use the fallback ladder.

| Role | Brand font | Web fallback | Office (DOCX/PPTX) | Email-safe |
|---|---|---|---|---|
| Display | **Fraunces** (500) | Georgia, serif | Georgia (if Fraunces not installed) | Georgia, serif |
| Text / UI | **Hanken Grotesk** (400–700) | system sans stack | Arial / Segoe UI | Arial, Helvetica, sans-serif |
| Mono / data | **IBM Plex Mono** (400–500) | ui-monospace | Consolas / Courier New | 'Courier New', monospace |

- **Headlines** in the display serif; **sub-heads** in the sans (creates rhythm, avoids serif overload).
- **Office docs:** install the three fonts on author machines, or embed fonts in the DOCX/PPTX (File ▸ Options ▸ Save ▸ Embed). If neither, the fallbacks above keep it close.
- **Email:** never rely on web fonts — use the email-safe stack inline.
- Use **tabular lining numerals** for all prices/data. Body measure ~66–72 characters.

## 4. Layout, grid & formats
- **Web:** 12-col, 1160px max, generous whitespace — see the website style guide.
- **A4 documents (DACH standard, not US Letter):** 210×297 mm. Margins 25 mm top/bottom, 20 mm sides. Logo top-left of a letterhead; footer carries page number + a one-line Impressum/▸ "RAGSuite — an innovation by NITSAN". Body 11 pt, headings in display serif, line-height ~1.4.
- **Presentations:** 16:9. Title, section-divider, content, and data-slide masters. Pine-deep dividers; paper content slides; one idea per slide.
- **Social:** LinkedIn 1200×627 (link) / 1080×1350 (portrait); X 1600×900. Keep text large, restrained, one message.
- **Radius/shape:** 8px small, 12px cards, 16px panels (scale to medium). Pills for badges only.

## 5. Iconography & imagery
Thin line icons (1.5px), monochrome ink/pine. **No** stock office photos, generic 3D blobs, neon, or glossy floating screenshots. Product shots = calm cropped fragments in a hairline frame. Diagrams = line-style (self-host topology, data flow). Motif family: **lock + document + check** (sovereignty + citation + verified). Optional 1–2% paper grain for a printed feel.

## 6. Motion
Sparing and purposeful (web only): scroll-in fade+rise once; the citation chip "verify" is the one signature animation. No parallax, autoplay, looping gradients, or count-ups. Honour `prefers-reduced-motion`.

## 7. Application specs by medium
- **Website →** website style guide + live Astro tokens (source of truth for web).
- **Documents (DOCX/PDF) →** A4, letterhead, Fraunces/Georgia headings, Hanken/Arial body, citation/footnote styling, page numbers, Impressum footer.
- **Presentations (PPTX) →** 16:9 masters; pine-deep title/section, paper content; big type; one stat or idea per slide; citation chips for sourced claims.
- **Email →** ~600px, table-based, inline styles, email-safe fonts, paper bg, pine CTA button; human sign-off + signature block.
- **Social →** brand-sized canvases, Fraunces headline, sovereign green, generous space, optional citation motif; logo lockup bottom-corner.

## 8. Do / Don't (brand-wide)
| Do | Don't |
|---|---|
| Warm paper, pine green, editorial type | Dark neon hero, gradients, logo-soup |
| Citations & specs as the proof | Adjective-stacked hype |
| EUR prices exactly as locked | Invent/round/convert prices |
| "an innovation by NITSAN" | RAGSuite as a TYPO3 product |
| Beta on n8n + mobile | Imply Beta is production |

## 9. Asset management
- Brand source of truth: this folder (`00-knowledge-base/brand/`).
- Logo files: `logo/`. Templates: `../../_templates/` (per format). Web tokens: the Astro repo.
- Naming: `kebab-case`; versioned/dated where time-bound. Export both light/reversed logo variants.

## 10. Pre-flight checklist (any deliverable)
Tokens & type correct · logo + clear-space right · colour mode right for medium (RGB screen / CMYK print) · fonts embedded or fallbacks set · voice & Beta/price/positioning guardrails passed · German native + Sie if applicable · co-brand present.
