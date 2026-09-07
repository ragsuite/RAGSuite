import {
  canPaintEmbedLauncher,
  shouldCoverChatEmbedIframe,
  shouldKeepChatEmbedCoverSession,
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

describe('shouldCoverChatEmbedIframe', () => {
  it('covers only when open with backdrop (blocks host page intentionally)', () => {
    expect(shouldCoverChatEmbedIframe({ open: true, showBackdrop: true })).toBe(true);
  });

  it('does not cover when open without backdrop (host page must stay clickable)', () => {
    expect(shouldCoverChatEmbedIframe({ open: true, showBackdrop: false })).toBe(false);
    expect(shouldCoverChatEmbedIframe({ open: true })).toBe(false);
  });

  it('does not cover when chat is closed', () => {
    expect(shouldCoverChatEmbedIframe({ open: false, showBackdrop: true })).toBe(false);
    expect(shouldCoverChatEmbedIframe({ open: false })).toBe(false);
  });
});

describe('shouldKeepChatEmbedCoverSession', () => {
  const base = {
    showBackdrop: true,
    closeCommitted: false,
    isOpen: false,
    isPanelAnimating: false,
    coverSessionActive: false,
  };

  it('keeps cover while open or animating with backdrop', () => {
    expect(shouldKeepChatEmbedCoverSession({ ...base, isOpen: true })).toBe(true);
    expect(shouldKeepChatEmbedCoverSession({ ...base, isPanelAnimating: true })).toBe(true);
    expect(shouldKeepChatEmbedCoverSession({ ...base, coverSessionActive: true })).toBe(true);
  });

  it('never re-covers after close is committed even if still animating', () => {
    expect(
      shouldKeepChatEmbedCoverSession({
        ...base,
        closeCommitted: true,
        isPanelAnimating: true,
        coverSessionActive: true,
      }),
    ).toBe(false);
  });

  it('does not keep cover without backdrop', () => {
    expect(shouldKeepChatEmbedCoverSession({ ...base, showBackdrop: false, isOpen: true })).toBe(
      false,
    );
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
