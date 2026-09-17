import {
  clampLogoBorderRadius,
  fitLogoBox,
  getWidgetLogoFallbackSize,
  getWidgetLogoMaxBox,
  resolveWidgetLogoChrome,
} from '@/features/app-chat-widget/utils/widget-logo-chrome';

describe('fitLogoBox', () => {
  it('keeps 1:1 logos square at max height', () => {
    expect(fitLogoBox(100, 100, 120, 36)).toEqual({ width: 36, height: 36 });
  });

  it('expands wide logos to aspect width within max height', () => {
    expect(fitLogoBox(300, 100, 120, 36)).toEqual({ width: 108, height: 36 });
  });

  it('shrinks ultra-wide logos to max width and reduces height', () => {
    expect(fitLogoBox(500, 100, 120, 36)).toEqual({ width: 120, height: 24 });
  });

  it('narrows tall logos within max height', () => {
    expect(fitLogoBox(50, 100, 120, 36)).toEqual({ width: 18, height: 36 });
  });

  it('falls back to square max height for invalid natural size', () => {
    expect(fitLogoBox(0, 100, 120, 36)).toEqual({ width: 36, height: 36 });
  });
});

describe('getWidgetLogoMaxBox / fallback / radius', () => {
  it('exposes per-surface max boxes and square fallbacks', () => {
    expect(getWidgetLogoMaxBox('home')).toEqual({ maxWidth: 120, maxHeight: 36 });
    expect(getWidgetLogoMaxBox('header')).toEqual({ maxWidth: 96, maxHeight: 24 });
    expect(getWidgetLogoMaxBox('adminPreview')).toEqual({
      maxWidth: 120,
      maxHeight: 30,
    });
    expect(getWidgetLogoFallbackSize('home')).toEqual({ width: 36, height: 36 });
    expect(getWidgetLogoFallbackSize('header')).toEqual({ width: 24, height: 24 });
  });

  it('clamps logo border radius to 0–20', () => {
    expect(clampLogoBorderRadius(-4)).toBe(0);
    expect(clampLogoBorderRadius(8)).toBe(8);
    expect(clampLogoBorderRadius(99)).toBe(20);
    expect(clampLogoBorderRadius(undefined)).toBe(8);
  });
});

describe('resolveWidgetLogoChrome', () => {
  it('keeps circular home/header chrome when there is no custom logo', () => {
    const home = resolveWidgetLogoChrome(null, 'home');
    expect(home.isCustom).toBe(false);
    expect(home.isFlexible).toBe(false);
    expect(home.contentFit).toBe('cover');
    expect(home.container).toMatchObject({
      width: 36,
      height: 36,
      borderRadius: 18,
    });

    const header = resolveWidgetLogoChrome('  ', 'header');
    expect(header.isCustom).toBe(false);
    expect(header.isFlexible).toBe(false);
    expect(header.container).toMatchObject({
      width: 24,
      height: 24,
      borderRadius: 12,
    });
  });

  it('uses circular crop for custom logos when shape is circle (default)', () => {
    const home = resolveWidgetLogoChrome('https://cdn.example.com/logo.png', 'home');
    expect(home.isCustom).toBe(true);
    expect(home.isFlexible).toBe(false);
    expect(home.contentFit).toBe('cover');
    expect(home.container).toMatchObject({
      width: 36,
      height: 36,
      borderRadius: 18,
    });

    const header = resolveWidgetLogoChrome(
      'data:image/png;base64,abc',
      'header',
      { logoShape: 'circle' },
    );
    expect(header.isFlexible).toBe(false);
    expect(header.container.width).toBe(24);
  });

  it('uses soft-radius contain chrome for flexible custom logos', () => {
    const home = resolveWidgetLogoChrome('https://cdn.example.com/logo.png', 'home', {
      logoShape: 'flexible',
      logoBorderRadius: 12,
    });
    expect(home.isCustom).toBe(true);
    expect(home.isFlexible).toBe(true);
    expect(home.contentFit).toBe('contain');
    expect(home.container.maxWidth).toBe(120);
    expect(home.container.maxHeight).toBe(36);
    expect(home.container.borderRadius).toBe(12);
    expect(home.container.width).toBeUndefined();
    expect(home.image.borderRadius).toBe(12);

    const preview = resolveWidgetLogoChrome('https://cdn.example.com/wide.svg', 'adminPreview', {
      logoShape: 'flexible',
      logoBorderRadius: 4,
    });
    expect(preview.isFlexible).toBe(true);
    expect(preview.container.borderRadius).toBe(4);
  });
});
