import {
  canPaintEmbedLauncher,
  shouldRevealEmbedHostIframe,
} from '@/features/app-chat-widget/utils/embed-iframe-visibility';

describe('shouldRevealEmbedHostIframe', () => {
  it('does not reveal on ready (hydration only)', () => {
    expect(shouldRevealEmbedHostIframe('ready')).toBe(false);
  });

  it('reveals on resize after branding can paint', () => {
    expect(shouldRevealEmbedHostIframe('resize')).toBe(true);
  });

  it('ignores unknown message types', () => {
    expect(shouldRevealEmbedHostIframe(undefined)).toBe(false);
    expect(shouldRevealEmbedHostIframe('open')).toBe(false);
  });
});

describe('canPaintEmbedLauncher', () => {
  const ready = {
    settingsLoading: false,
    chatbotActive: true,
    config: { showLauncher: true },
    displayCustomization: { avatarSize: 38 },
  };

  it('allows paint only when settings are loaded and chatbot is active', () => {
    expect(canPaintEmbedLauncher(ready)).toBe(true);
  });

  it('blocks the default launcher while settings are loading', () => {
    expect(canPaintEmbedLauncher({ ...ready, settingsLoading: true })).toBe(false);
  });

  it('stays hidden when the chatbot is inactive', () => {
    expect(canPaintEmbedLauncher({ ...ready, chatbotActive: false })).toBe(false);
  });

  it('stays hidden until config and customization exist', () => {
    expect(canPaintEmbedLauncher({ ...ready, config: null })).toBe(false);
    expect(canPaintEmbedLauncher({ ...ready, displayCustomization: null })).toBe(false);
  });
});
