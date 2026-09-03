import {
  canPaintSearchEmbed,
  resolveSearchEmbedHiddenReason,
  shouldRevealSearchEmbedHostIframe,
} from '@/features/app-search-widget/utils/embed-iframe-visibility';

describe('shouldRevealSearchEmbedHostIframe', () => {
  it('does not reveal on ready (hydration only)', () => {
    expect(shouldRevealSearchEmbedHostIframe('ready')).toBe(false);
  });

  it('reveals on resize after branding can paint', () => {
    expect(shouldRevealSearchEmbedHostIframe('resize')).toBe(true);
  });

  it('ignores unknown message types', () => {
    expect(shouldRevealSearchEmbedHostIframe(undefined)).toBe(false);
    expect(shouldRevealSearchEmbedHostIframe('open')).toBe(false);
  });
});

describe('canPaintSearchEmbed', () => {
  const ready = {
    settingsLoading: false,
    searchActive: true,
    config: { title: 'Search' },
    customization: { searchFormType: 'with-button' },
  };

  it('allows paint only when settings are loaded and search is active', () => {
    expect(canPaintSearchEmbed(ready)).toBe(true);
  });

  it('blocks while settings are loading', () => {
    expect(canPaintSearchEmbed({ ...ready, settingsLoading: true })).toBe(false);
  });

  it('stays hidden when search is inactive', () => {
    expect(canPaintSearchEmbed({ ...ready, searchActive: false })).toBe(false);
  });

  it('stays hidden until config and customization exist', () => {
    expect(canPaintSearchEmbed({ ...ready, config: null })).toBe(false);
    expect(canPaintSearchEmbed({ ...ready, customization: null })).toBe(false);
  });
});

describe('resolveSearchEmbedHiddenReason', () => {
  it('returns null while loading or when paint is allowed', () => {
    expect(
      resolveSearchEmbedHiddenReason({
        settingsLoading: true,
        settingsLoadFailed: false,
        searchActive: true,
        hasSettings: false,
        canPaint: false,
      }),
    ).toBeNull();
    expect(
      resolveSearchEmbedHiddenReason({
        settingsLoading: false,
        settingsLoadFailed: false,
        searchActive: true,
        hasSettings: true,
        canPaint: true,
      }),
    ).toBeNull();
  });

  it('returns inactive only when settings loaded and search is explicitly off', () => {
    expect(
      resolveSearchEmbedHiddenReason({
        settingsLoading: false,
        settingsLoadFailed: false,
        searchActive: false,
        hasSettings: true,
        canPaint: false,
      }),
    ).toBe('inactive');
  });

  it('returns error on fetch failure or missing settings (not inactive)', () => {
    expect(
      resolveSearchEmbedHiddenReason({
        settingsLoading: false,
        settingsLoadFailed: true,
        searchActive: true,
        hasSettings: false,
        canPaint: false,
      }),
    ).toBe('error');
    expect(
      resolveSearchEmbedHiddenReason({
        settingsLoading: false,
        settingsLoadFailed: false,
        searchActive: true,
        hasSettings: false,
        canPaint: false,
      }),
    ).toBe('error');
  });
});
