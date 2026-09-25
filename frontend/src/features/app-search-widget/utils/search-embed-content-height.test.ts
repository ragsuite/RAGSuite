import {
  clampSearchEmbedContentHeight,
  measureSearchEmbedHostHeight,
  measureSearchEmbedOverlayExtension,
  resolveSearchEmbedFrameBox,
  SEARCH_EMBED_DEFAULT_HEIGHT,
  SEARCH_EMBED_MIN_HEIGHT,
} from '@/features/app-search-widget/utils/search-embed-content-height';

describe('clampSearchEmbedContentHeight', () => {
  it('uses default for non-positive or non-finite values', () => {
    expect(clampSearchEmbedContentHeight(0)).toBe(SEARCH_EMBED_DEFAULT_HEIGHT);
    expect(clampSearchEmbedContentHeight(-10)).toBe(SEARCH_EMBED_DEFAULT_HEIGHT);
    expect(clampSearchEmbedContentHeight(Number.NaN)).toBe(SEARCH_EMBED_DEFAULT_HEIGHT);
  });

  it('enforces minimum height and ceilings fractional values', () => {
    expect(clampSearchEmbedContentHeight(40)).toBe(SEARCH_EMBED_MIN_HEIGHT);
    expect(clampSearchEmbedContentHeight(88.2)).toBe(89);
    expect(clampSearchEmbedContentHeight(460)).toBe(460);
  });
});

describe('measureSearchEmbedHostHeight', () => {
  it('returns 0 for null node', () => {
    expect(measureSearchEmbedHostHeight(null)).toBe(0);
  });

  it('prefers the largest positive content metric', () => {
    const node = {
      getBoundingClientRect: () => ({ height: 88 }),
      scrollHeight: 220,
      offsetHeight: 90,
    } as unknown as HTMLElement;
    expect(measureSearchEmbedHostHeight(node)).toBe(220);
  });
});

describe('measureSearchEmbedOverlayExtension', () => {
  it('ignores a menu that stays inside the host', () => {
    expect(measureSearchEmbedOverlayExtension(140, 180)).toBe(0);
    expect(measureSearchEmbedOverlayExtension(180.4, 180)).toBe(0);
  });

  it('returns only the pixels hanging below the host', () => {
    expect(measureSearchEmbedOverlayExtension(348, 160)).toBe(188);
  });
});

describe('resolveSearchEmbedFrameBox', () => {
  it('keeps the layout footprint equal to content height when the menu overlays', () => {
    const box = resolveSearchEmbedFrameBox(160, 188);
    expect(box).toEqual({ height: 348, marginBottom: 188 });
    expect(box.height - box.marginBottom).toBe(160);
  });

  it('does not add margin when the menu is closed', () => {
    expect(resolveSearchEmbedFrameBox(160, 0)).toEqual({ height: 160, marginBottom: 0 });
  });
});
