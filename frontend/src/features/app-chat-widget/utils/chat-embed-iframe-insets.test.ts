import {
  resolveChatEmbedIframeOffset,
  resolveChatEmbedInnerLauncherInset,
  resolveChatEmbedPinnedPanelAnchor,
} from '@/features/app-chat-widget/utils/chat-embed-iframe-insets';

describe('resolveChatEmbedIframeOffset', () => {
  it('puts widgetBottomSpace on the page iframe offsetY', () => {
    expect(
      resolveChatEmbedIframeOffset({
        widgetBottomSpace: 46,
        horizontalInset: 20,
      }),
    ).toEqual({ offsetX: 20, offsetY: 58 });
  });

  it('floors offsetX to 12 when horizontal inset is smaller', () => {
    expect(
      resolveChatEmbedIframeOffset({
        widgetBottomSpace: 0,
        horizontalInset: 8,
      }),
    ).toEqual({ offsetX: 12, offsetY: 12 });
  });
});

describe('resolveChatEmbedInnerLauncherInset', () => {
  it('keeps closed inner bottom at 0 so hint height is not eaten', () => {
    expect(
      resolveChatEmbedInnerLauncherInset({
        keyboardInset: 0,
        isOpen: false,
      }),
    ).toEqual({ bottom: 0, side: 0 });
  });

  it('uses keyboard-only bottom when open without fullscreen cover', () => {
    expect(
      resolveChatEmbedInnerLauncherInset({
        keyboardInset: 24,
        isOpen: true,
        coverFullscreen: false,
        widgetBottomSpace: 46,
        horizontalInset: 20,
      }),
    ).toEqual({ bottom: 24, side: 0 });
  });

  it('applies page spacing inside when cover is fullscreen', () => {
    expect(
      resolveChatEmbedInnerLauncherInset({
        keyboardInset: 10,
        isOpen: true,
        coverFullscreen: true,
        widgetBottomSpace: 46,
        horizontalInset: 20,
      }),
    ).toEqual({ bottom: 68, side: 20 });
  });
});

describe('resolveChatEmbedPinnedPanelAnchor', () => {
  it('pins bottom-right panel above launcher + gap', () => {
    expect(
      resolveChatEmbedPinnedPanelAnchor({
        position: 'bottom-right',
        launcherSize: 38,
        launcherGap: 12,
        keyboardInset: 0,
      }),
    ).toEqual({ bottom: 50, right: 0 });
  });

  it('pins bottom-left and includes keyboard inset', () => {
    expect(
      resolveChatEmbedPinnedPanelAnchor({
        position: 'bottom-left',
        launcherSize: 40,
        launcherGap: 12,
        keyboardInset: 24,
      }),
    ).toEqual({ bottom: 76, left: 0 });
  });
});
