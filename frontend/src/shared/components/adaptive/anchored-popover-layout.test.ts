import { resolveAnchoredPopoverLayout } from '@/shared/components/adaptive/anchored-popover-layout';

describe('resolveAnchoredPopoverLayout', () => {
  it('opens below when there is more room under the anchor', () => {
    const layout = resolveAnchoredPopoverLayout({
      anchor: { top: 200, left: 100, width: 240, height: 44 },
      windowWidth: 1200,
      windowHeight: 900,
      popoverWidth: 240,
      preferredMaxHeight: 280,
    });

    expect(layout.openBelow).toBe(true);
    expect(layout.menuTop).toBe(248);
    expect(layout.menuMaxHeight).toBe(280);
  });

  it('opens above when there is more room above the anchor', () => {
    const layout = resolveAnchoredPopoverLayout({
      anchor: { top: 680, left: 100, width: 240, height: 44 },
      windowWidth: 1200,
      windowHeight: 900,
      popoverWidth: 240,
      preferredMaxHeight: 280,
    });

    expect(layout.openBelow).toBe(false);
    expect(layout.menuBottom).toBe(224);
    expect(layout.menuTop).toBeUndefined();
    expect(layout.menuMaxHeight).toBe(280);
  });

  it('left-aligns the menu to the anchor edge', () => {
    const layout = resolveAnchoredPopoverLayout({
      anchor: { top: 200, left: 100, width: 120, height: 44 },
      windowWidth: 1200,
      windowHeight: 900,
      popoverWidth: 176,
    });

    expect(layout.menuLeft).toBe(100);
  });

  it('clamps height to available viewport space', () => {
    const layout = resolveAnchoredPopoverLayout({
      anchor: { top: 200, left: 100, width: 240, height: 44 },
      windowWidth: 1200,
      windowHeight: 520,
      popoverWidth: 240,
      preferredMaxHeight: 280,
    });

    expect(layout.openBelow).toBe(true);
    expect(layout.menuMaxHeight).toBeLessThan(280);
    expect((layout.menuTop ?? 0) + layout.menuMaxHeight).toBeLessThanOrEqual(520);
  });
});
