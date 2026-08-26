import {
  CHAT_EMBED_HINT_MAX_WIDTH,
  measureClosedChatEmbedFrame,
  resolveClosedChatEmbedFrameSize,
  resolveOpenChatEmbedFrameSize,
  resolveOpenChatEmbedPanelHeightForFrame,
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

describe('resolveOpenChatEmbedFrameSize', () => {
  it('adds pad and launcher reserve to panel size', () => {
    expect(
      resolveOpenChatEmbedFrameSize({
        panelWidth: 400,
        panelHeight: 600,
        launcherSize: 38,
        launcherGap: 12,
      }),
    ).toEqual({ width: 432, height: 682 });
  });

  it('enforces minimum floor for tiny panel sizes', () => {
    expect(
      resolveOpenChatEmbedFrameSize({
        panelWidth: 200,
        panelHeight: 200,
        launcherSize: 30,
        launcherGap: 10,
      }),
    ).toEqual({ width: 320, height: 360 });
  });

  it('clamps height to the remaining host viewport', () => {
    expect(
      resolveOpenChatEmbedFrameSize({
        panelWidth: 400,
        panelHeight: 720,
        launcherSize: 38,
        launcherGap: 12,
        maxHeight: 500,
      }),
    ).toEqual({ width: 432, height: 500 });
  });

  it('keeps a 400×600 customization frame large enough for dashboard-parity panel paint', () => {
    const frame = resolveOpenChatEmbedFrameSize({
      panelWidth: 400,
      panelHeight: 600,
      launcherSize: 38,
      launcherGap: 12,
      maxHeight: 900,
    });
    // Iframe = panel + launcher + gap + pad; panel itself stays 400×600 when unclamped.
    expect(frame).toEqual({ width: 432, height: 682 });
    expect(frame.height).toBeGreaterThanOrEqual(600 + 38 + 12 + 32);
  });
});

describe('resolveOpenChatEmbedPanelHeightForFrame', () => {
  it('shrinks preferred panel height to fit the clamped frame', () => {
    expect(
      resolveOpenChatEmbedPanelHeightForFrame({
        frameHeight: 500,
        launcherSize: 38,
        launcherGap: 12,
        preferredHeight: 720,
      }),
    ).toBe(418);
  });

  it('preserves preferred 600 height when the open frame is unclamped', () => {
    const frame = resolveOpenChatEmbedFrameSize({
      panelWidth: 400,
      panelHeight: 600,
      launcherSize: 38,
      launcherGap: 12,
    });
    expect(
      resolveOpenChatEmbedPanelHeightForFrame({
        frameHeight: frame.height,
        launcherSize: 38,
        launcherGap: 12,
        preferredHeight: 600,
      }),
    ).toBe(600);
  });
});
