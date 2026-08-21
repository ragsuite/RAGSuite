import {
  CHAT_EMBED_HINT_MAX_WIDTH,
  measureClosedChatEmbedFrame,
  resolveClosedChatEmbedFrameSize,
} from '@/features/app-chat-widget/utils/closed-chat-embed-frame';

describe('measureClosedChatEmbedFrame', () => {
  it('returns null for missing node', () => {
    expect(measureClosedChatEmbedFrame(null)).toBeNull();
  });

  it('uses the largest positive DOM metric', () => {
    const node = {
      getBoundingClientRect: () => ({ width: 94, height: 94 }),
      scrollWidth: 280,
      scrollHeight: 160,
      offsetWidth: 94,
      offsetHeight: 94,
    } as unknown as HTMLElement;
    expect(measureClosedChatEmbedFrame(node)).toEqual({ width: 280, height: 160 });
  });
});

describe('resolveClosedChatEmbedFrameSize', () => {
  it('floors to launcher size when hint is hidden', () => {
    expect(
      resolveClosedChatEmbedFrameSize({
        measured: { width: 50, height: 50 },
        launcherSize: 38,
        showBubble: false,
      }),
    ).toEqual({ width: 64, height: 64 });
  });

  it('enforces hint floor when bubble is shown', () => {
    const size = resolveClosedChatEmbedFrameSize({
      measured: { width: 94, height: 94 },
      launcherSize: 38,
      showBubble: true,
    });
    expect(size.width).toBeGreaterThanOrEqual(CHAT_EMBED_HINT_MAX_WIDTH + 16 + 16);
    expect(size.height).toBeGreaterThan(94);
  });

  it('keeps larger measured dimensions', () => {
    const size = resolveClosedChatEmbedFrameSize({
      measured: { width: 400, height: 220 },
      launcherSize: 38,
      showBubble: true,
    });
    expect(size).toEqual({ width: 400, height: 220 });
  });
});
