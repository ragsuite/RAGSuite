/**
 * Typography scale — maps to ragsuite-brand-kit tokens/design-tokens.json font-size.*
 * display-l → pageDisplay | heading-m → sectionDisplay | heading-s → headingSemibold/cardTitle
 * body-m → body | body-s → caption | eyebrow → eyebrow | citation → citation
 */
export const typography = {
  hero: {
    fontSize: 32,
    fontWeight: "500" as const,
    letterSpacing: -0.48,
  },
  title: {
    fontSize: 22,
    fontWeight: "600" as const,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: "500" as const,
  },
  body: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 26,
  },
  caption: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 21,
  },
  /** Form field labels — medium weight, not semibold. */
  fieldLabel: {
    fontSize: 16,
    fontWeight: "500" as const,
    lineHeight: 24,
  },
  /** Form text inputs — paired with fieldLabel sizing. */
  fieldInput: {
    fontSize: 16,
    fontWeight: "400" as const,
    lineHeight: 24,
  },
  /** Card titles — heading-s (1.25rem) per components.css .rs-card__title. */
  cardTitle: {
    fontSize: 20,
    fontWeight: "600" as const,
    lineHeight: 28,
  },
  /** Preview / training tile headings — lighter than cardTitle. */
  panelTileLabel: {
    fontSize: 17,
    fontWeight: "500" as const,
    lineHeight: 22,
  },
  /** Analytics chart card title — lighter than headingSemibold. */
  chartCardTitle: {
    fontSize: 15,
    fontWeight: "500" as const,
    lineHeight: 20,
  },
  /** In-list section headers (Queries, Feedback entries) — lighter than cardTitle. */
  listSectionTitle: {
    fontSize: 17,
    fontWeight: "500" as const,
    lineHeight: 22,
  },
  listSectionDescription: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  /** Primary button labels — Hanken 500, 0.9375rem per components.css .rs-btn. */
  buttonLabel: {
    fontSize: 15,
    fontWeight: "500" as const,
    lineHeight: 22,
  },
  /** In-content section headers — heading-s (1.25rem), Hanken 600. */
  headingSemibold: {
    fontSize: 20,
    fontWeight: "600" as const,
    lineHeight: 28,
  },
  /** Major in-page section titles — heading-m (1.5rem), Hanken 600. */
  sectionDisplay: {
    fontSize: 24,
    fontWeight: "600" as const,
    lineHeight: 30,
    letterSpacing: -0.35,
  },
  /** Page-level display title — display-l compact baseline; 32px on web parity via PageSectionHeader. */
  pageDisplay: {
    fontSize: 26,
    fontWeight: "500" as const,
    letterSpacing: -0.5,
    lineHeight: 30,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "500" as const,
    letterSpacing: 0.96,
    textTransform: "uppercase" as const,
  },
  citation: {
    fontSize: 13,
    fontWeight: "400" as const,
    lineHeight: 18,
  },
  metric: {
    fontSize: 32,
    fontWeight: "500" as const,
    fontVariant: ["tabular-nums", "lining-nums"] as (
      | "tabular-nums"
      | "lining-nums"
    )[],
  },
  numeric: {
    fontVariant: ["tabular-nums", "lining-nums"] as (
      | "tabular-nums"
      | "lining-nums"
    )[],
  },
} as const;
