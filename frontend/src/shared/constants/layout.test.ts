import {
  getWebContentViewportWidth,
  getWebDrawerWidth,
  WEB_DRAWER_WIDTH_COLLAPSED,
  WEB_DRAWER_WIDTH_EXPANDED,
} from '@/shared/constants/layout';

describe('web content viewport layout', () => {
  it('subtracts expanded drawer width from viewport', () => {
    expect(getWebContentViewportWidth(1200, false)).toBe(1200 - WEB_DRAWER_WIDTH_EXPANDED);
  });

  it('subtracts collapsed drawer width from viewport', () => {
    expect(getWebContentViewportWidth(1200, true)).toBe(1200 - WEB_DRAWER_WIDTH_COLLAPSED);
  });

  it('clamps to minimum content width', () => {
    expect(getWebContentViewportWidth(400, false)).toBe(320);
  });

  it('exposes drawer widths used by the app shell', () => {
    expect(getWebDrawerWidth(false)).toBe(WEB_DRAWER_WIDTH_EXPANDED);
    expect(getWebDrawerWidth(true)).toBe(WEB_DRAWER_WIDTH_COLLAPSED);
  });
});
