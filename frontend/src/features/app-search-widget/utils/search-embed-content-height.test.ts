import {
  clampSearchEmbedContentHeight,
  measureSearchEmbedHostHeight,
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
