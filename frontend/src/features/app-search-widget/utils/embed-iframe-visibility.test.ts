import {
  canPaintSearchEmbed,
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
