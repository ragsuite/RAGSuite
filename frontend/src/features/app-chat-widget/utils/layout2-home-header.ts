/**
 * Layout 2 Home header sizing — proportional to panel content height so Chrome
 * resize keeps a dominant header / CTA-on-seam without absolute MIN_HEADER crushing
 * the body, and without unbounded growth on tall panels.
 *
 * When two CTAs are shown (Chat + Voice Pilot), use a slightly shorter header so
 * both cards fit in the lower band without clutter.
 */

export const LAYOUT2_HOME_HEADER_RATIO = 0.75;
export const LAYOUT2_HOME_HEADER_RATIO_DUAL_CTA = 0.62;
const HEADER_RATIO_FLOOR = 0.55;
const HEADER_RATIO_CEIL = 0.8;
const HEADER_RATIO_FLOOR_DUAL = 0.48;
const HEADER_RATIO_CEIL_DUAL = 0.68;
/** Absolute floor so the band never collapses on tiny panels. */
const HEADER_ABSOLUTE_FLOOR = 120;
/**
 * Absolute ceiling — reference band at ~600px panel (~400px header).
 * Prevents endless empty blue between badge and name when the panel is taller.
 */
export const LAYOUT2_HOME_HEADER_ABSOLUTE_MAX = 400;
/** Dual-CTA: keep header shorter so both cards sit cleanly on the seam. */
export const LAYOUT2_HOME_HEADER_ABSOLUTE_MAX_DUAL = 320;
/** Reference header height at contentHeight ≈ 542 (600 panel − tab bar). */
const REFERENCE_HEADER = 406;

export type Layout2HomeHeaderMetrics = {
  headerHeight: number;
  ctaOverlap: number;
  textBottom: number;
  badgeTop: number;
  /** Vertical gap between stacked CTA cards when dual mode is on. */
  ctaStackGap: number;
};

export function resolveLayout2HomeHeaderMetrics(
  contentHeight: number,
  options?: { dualCta?: boolean },
): Layout2HomeHeaderMetrics {
  const dual = Boolean(options?.dualCta);
  const h = Math.max(0, Math.round(contentHeight));
  if (h <= 0) {
    return {
      headerHeight: HEADER_ABSOLUTE_FLOOR,
      ctaOverlap: dual ? 28 : 16,
      textBottom: dual ? 50 : 24,
      badgeTop: 16,
      ctaStackGap: 0,
    };
  }

  const ratio = dual ? LAYOUT2_HOME_HEADER_RATIO_DUAL_CTA : LAYOUT2_HOME_HEADER_RATIO;
  const ratioMin = Math.round(h * (dual ? HEADER_RATIO_FLOOR_DUAL : HEADER_RATIO_FLOOR));
  const ratioMax = Math.round(h * (dual ? HEADER_RATIO_CEIL_DUAL : HEADER_RATIO_CEIL));
  const raw = Math.round(h * ratio);
  let headerHeight = Math.min(ratioMax, Math.max(ratioMin, raw));
  const absMax = dual ? LAYOUT2_HOME_HEADER_ABSOLUTE_MAX_DUAL : LAYOUT2_HOME_HEADER_ABSOLUTE_MAX;
  headerHeight = Math.min(absMax, Math.max(HEADER_ABSOLUTE_FLOOR, headerHeight));
  /** Never taller than the content area itself. */
  headerHeight = Math.min(h, headerHeight);

  const scale = headerHeight / REFERENCE_HEADER;
  // Dual CTA: larger absolute overlap so the first card sits higher on the seam
  // even though the header band is shorter.
  const ctaOverlap = dual
    ? Math.round(Math.min(44, Math.max(28, 42 * scale)))
    : Math.round(Math.min(32, Math.max(16, 32 * scale)));
  // Keep title well clear of overlapping CTAs (avoid “rushing” into the seam).
  const textBottom = dual
    ? Math.round(Math.min(headerHeight * 0.42, Math.max(ctaOverlap + 22, 58)))
    : Math.round(Math.min(48, Math.max(22, 48 * scale)));
  const badgeTop = Math.round(Math.min(32, Math.max(16, 32 * scale)));
  const ctaStackGap = 0;

  return { headerHeight, ctaOverlap, textBottom, badgeTop, ctaStackGap };
}
