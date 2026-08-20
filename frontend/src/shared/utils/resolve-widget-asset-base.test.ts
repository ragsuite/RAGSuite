import {
  ensureAbsoluteHttpUrl,
  resolveWidgetAssetBase,
} from '@/shared/utils/resolve-widget-asset-base';

describe('ensureAbsoluteHttpUrl', () => {
  it('prepends https:// for bare hosts and host paths', () => {
    expect(ensureAbsoluteHttpUrl('widgets.example.com')).toBe('https://widgets.example.com');
    expect(ensureAbsoluteHttpUrl('widgets.example.com/api/v1')).toBe(
      'https://widgets.example.com/api/v1',
    );
  });

  it('preserves http(s) and protocol-relative URLs', () => {
    expect(ensureAbsoluteHttpUrl('https://admin.example.com/')).toBe(
      'https://admin.example.com',
    );
    expect(ensureAbsoluteHttpUrl('http://localhost:9191')).toBe('http://localhost:9191');
    expect(ensureAbsoluteHttpUrl('//cdn.example.com/widgets')).toBe(
      '//cdn.example.com/widgets',
    );
  });

  it('returns empty string for blank input', () => {
    expect(ensureAbsoluteHttpUrl('')).toBe('');
    expect(ensureAbsoluteHttpUrl(null)).toBe('');
    expect(ensureAbsoluteHttpUrl(undefined)).toBe('');
  });
});

describe('resolveWidgetAssetBase', () => {
  it('coerces protocol-less configured base to https', () => {
    expect(
      resolveWidgetAssetBase({
        configuredBase: 'widgets.example.com',
        pageOrigin: 'https://admin.example.com',
      }),
    ).toBe('https://widgets.example.com');
  });

  it('prefers configured base over page origin', () => {
    expect(
      resolveWidgetAssetBase({
        configuredBase: 'https://admin.example.com/',
        pageOrigin: 'https://localhost:8081',
        apiBaseUrl: 'https://api.example.com/api/v1',
      }),
    ).toBe('https://admin.example.com');
  });

  it('falls back to page origin then api origin', () => {
    expect(
      resolveWidgetAssetBase({
        pageOrigin: 'https://admin.example.com',
        apiBaseUrl: 'https://api.example.com/api/v1',
      }),
    ).toBe('https://admin.example.com');
    expect(
      resolveWidgetAssetBase({
        apiBaseUrl: 'widgets.example.com/api/v1',
      }),
    ).toBe('https://widgets.example.com');
  });
});
