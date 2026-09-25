import {
  LAYOUT2_HOME_HEADER_ABSOLUTE_MAX,
  LAYOUT2_HOME_HEADER_ABSOLUTE_MAX_DUAL,
  LAYOUT2_HOME_HEADER_RATIO,
  LAYOUT2_HOME_HEADER_RATIO_DUAL_CTA,
  resolveLayout2HomeHeaderMetrics,
} from '@/features/app-chat-widget/utils/layout2-home-header';

describe('resolveLayout2HomeHeaderMetrics', () => {
  it('keeps ~75% header at normal panel content height', () => {
    const contentHeight = 500;
    const { headerHeight } = resolveLayout2HomeHeaderMetrics(contentHeight);
    expect(headerHeight).toBe(Math.round(contentHeight * LAYOUT2_HOME_HEADER_RATIO));
    expect(headerHeight / contentHeight).toBeCloseTo(0.75, 2);
  });

  it('stays proportional on short content instead of forcing 280px', () => {
    const contentHeight = 280;
    const { headerHeight } = resolveLayout2HomeHeaderMetrics(contentHeight);
    expect(headerHeight).toBeLessThan(280);
    expect(headerHeight).toBe(Math.round(contentHeight * LAYOUT2_HOME_HEADER_RATIO));
    expect(headerHeight / contentHeight).toBeCloseTo(0.75, 2);
  });

  it('caps absolute header height on tall panels to avoid empty stretch', () => {
    const tall = resolveLayout2HomeHeaderMetrics(800);
    expect(tall.headerHeight).toBe(LAYOUT2_HOME_HEADER_ABSOLUTE_MAX);
    expect(tall.headerHeight).toBeLessThan(Math.round(800 * LAYOUT2_HOME_HEADER_RATIO));
  });

  it('clamps within ratio bounds on short content', () => {
    const short = resolveLayout2HomeHeaderMetrics(200);
    expect(short.headerHeight).toBeLessThanOrEqual(Math.round(200 * 0.8));
    expect(short.headerHeight).toBeGreaterThanOrEqual(Math.max(120, Math.round(200 * 0.55)));
  });

  it('scales CTA overlap and text inset with header height', () => {
    const normal = resolveLayout2HomeHeaderMetrics(500);
    const short = resolveLayout2HomeHeaderMetrics(280);
    expect(short.ctaOverlap).toBeLessThanOrEqual(normal.ctaOverlap);
    expect(short.textBottom).toBeLessThanOrEqual(normal.textBottom);
    expect(short.badgeTop).toBeLessThanOrEqual(normal.badgeTop);
  });

  it('returns a safe floor for empty content height', () => {
    const empty = resolveLayout2HomeHeaderMetrics(0);
    expect(empty.headerHeight).toBe(120);
  });

  it('shortens header and raises CTA overlap when dual CTA is on', () => {
    const single = resolveLayout2HomeHeaderMetrics(500);
    const dual = resolveLayout2HomeHeaderMetrics(500, { dualCta: true });
    expect(dual.headerHeight).toBeLessThan(single.headerHeight);
    expect(dual.headerHeight).toBe(
      Math.round(500 * LAYOUT2_HOME_HEADER_RATIO_DUAL_CTA),
    );
    expect(dual.ctaOverlap).toBeGreaterThanOrEqual(single.ctaOverlap);
    // Title sits above the overlapping CTA stack (not crushed into the seam).
    expect(dual.textBottom).toBeGreaterThan(dual.ctaOverlap);
    expect(dual.textBottom).toBeGreaterThan(single.textBottom);
  });

  it('caps dual-CTA header lower on tall panels', () => {
    const dual = resolveLayout2HomeHeaderMetrics(800, { dualCta: true });
    expect(dual.headerHeight).toBe(LAYOUT2_HOME_HEADER_ABSOLUTE_MAX_DUAL);
    expect(dual.headerHeight).toBeLessThan(LAYOUT2_HOME_HEADER_ABSOLUTE_MAX);
  });
});
