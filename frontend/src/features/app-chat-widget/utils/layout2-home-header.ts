/**
 * Layout 2 Home header sizing — proportional to panel content height so Chrome
 * resize keeps ~75% header / CTA-on-seam without absolute MIN_HEADER crushing the body,
 * and without unbounded growth creating a huge empty band on tall panels.
 */

export const LAYOUT2_HOME_HEADER_RATIO = 0.75;
const HEADER_RATIO_FLOOR = 0.55;
const HEADER_RATIO_CEIL = 0.8;
/** Absolute floor so the band never collapses on tiny panels. */
const HEADER_ABSOLUTE_FLOOR = 120;
/**
 * Absolute ceiling — reference band at ~600px panel (~400px header).
 * Prevents endless empty blue between badge and name when the panel is taller.
 */
export const LAYOUT2_HOME_HEADER_ABSOLUTE_MAX = 400;
/** Reference header height at contentHeight ≈ 542 (600 panel − tab bar). */
const REFERENCE_HEADER = 406;

export type Layout2HomeHeaderMetrics = {
  headerHeight: number;
  ctaOverlap: number;
  textBottom: number;
  badgeTop: number;
};

export function resolveLayout2HomeHeaderMetrics(
  contentHeight: number,
): Layout2HomeHeaderMetrics {
  const h = Math.max(0, Math.round(contentHeight));
  if (h <= 0) {
    return {
      headerHeight: HEADER_ABSOLUTE_FLOOR,
      ctaOverlap: 16,
      textBottom: 24,
      badgeTop: 16,
    };
  }

  const raw = Math.round(h * LAYOUT2_HOME_HEADER_RATIO);
  const ratioMin = Math.round(h * HEADER_RATIO_FLOOR);
  const ratioMax = Math.round(h * HEADER_RATIO_CEIL);
  let headerHeight = Math.min(ratioMax, Math.max(ratioMin, raw));
  headerHeight = Math.min(
    LAYOUT2_HOME_HEADER_ABSOLUTE_MAX,
    Math.max(HEADER_ABSOLUTE_FLOOR, headerHeight),
  );
  /** Never taller than the content area itself. */
  headerHeight = Math.min(h, headerHeight);

  const scale = headerHeight / REFERENCE_HEADER;
  const ctaOverlap = Math.round(Math.min(32, Math.max(16, 32 * scale)));
  const textBottom = Math.round(Math.min(48, Math.max(28, 48 * scale)));
  const badgeTop = Math.round(Math.min(32, Math.max(16, 32 * scale)));

  return { headerHeight, ctaOverlap, textBottom, badgeTop };
}
