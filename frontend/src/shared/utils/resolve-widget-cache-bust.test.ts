import { resolveWidgetCacheBustValue } from '@/shared/utils/resolve-widget-cache-bust';

describe('resolveWidgetCacheBustValue', () => {
  const stale = { '20260820': true, '20260818': true, '20260821': true, '20260822': true, '20260823': true };
  const current = '20260824';

  it('maps latest to WIDGET_ASSET_VERSION', () => {
    expect(resolveWidgetCacheBustValue('latest', current, stale)).toBe(current);
    expect(resolveWidgetCacheBustValue('LATEST', current, stale)).toBe(current);
  });

  it('maps stale and empty to WIDGET_ASSET_VERSION', () => {
    expect(resolveWidgetCacheBustValue('20260820', current, stale)).toBe(current);
    expect(resolveWidgetCacheBustValue('', current, stale)).toBe(current);
    expect(resolveWidgetCacheBustValue(null, current, stale)).toBe(current);
  });

  it('keeps non-stale explicit bust', () => {
    expect(resolveWidgetCacheBustValue('my-pin-1', current, stale)).toBe('my-pin-1');
  });
});
