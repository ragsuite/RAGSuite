import {
  clearChatWidgetPopOutWindow,
  focusChatWidgetPopOutWindow,
  isChatWidgetPopOutSyncMessage,
  isChatWidgetPopOutWindowOpen,
  publishChatWidgetPopOutSync,
  registerChatWidgetPopOutWindow,
} from '@/features/app-chat-widget/utils/app-chat-widget-pop-out-sync';

describe('isChatWidgetPopOutSyncMessage', () => {
  it('accepts valid payloads', () => {
    expect(
      isChatWidgetPopOutSyncMessage({
        type: 'opened',
        projectId: 'proj-1',
        sessionId: 'sess-1',
      }),
    ).toBe(true);
    expect(isChatWidgetPopOutSyncMessage({ type: 'closed', projectId: 'proj-1' })).toBe(true);
    expect(
      isChatWidgetPopOutSyncMessage({ type: 'session', projectId: 'proj-1', sessionId: 'sess-2' }),
    ).toBe(true);
  });

  it('rejects invalid payloads', () => {
    expect(isChatWidgetPopOutSyncMessage(null)).toBe(false);
    expect(isChatWidgetPopOutSyncMessage({ type: 'opened' })).toBe(false);
    expect(isChatWidgetPopOutSyncMessage({ type: 'nope', projectId: 'proj-1' })).toBe(false);
    expect(
      isChatWidgetPopOutSyncMessage({ type: 'session', projectId: 'proj-1', sessionId: 3 }),
    ).toBe(false);
  });
});

describe('publishChatWidgetPopOutSync', () => {
  it('posts to BroadcastChannel when available', () => {
    const posts: unknown[] = [];
    const closes: number[] = [];
    const FakeBroadcastChannel = jest.fn().mockImplementation(() => ({
      postMessage: (data: unknown) => {
        posts.push(data);
      },
      close: () => {
        closes.push(1);
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }));

    const original = globalThis.BroadcastChannel;
    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      writable: true,
      value: FakeBroadcastChannel,
    });

    publishChatWidgetPopOutSync({
      type: 'opened',
      projectId: 'proj-1',
      sessionId: 'sess-9',
    });

    expect(posts).toEqual([{ type: 'opened', projectId: 'proj-1', sessionId: 'sess-9' }]);
    expect(closes).toHaveLength(1);

    Object.defineProperty(globalThis, 'BroadcastChannel', {
      configurable: true,
      writable: true,
      value: original,
    });
  });
});

describe('registered pop-out window focus', () => {
  const originalOpen = window.open;

  afterEach(() => {
    clearChatWidgetPopOutWindow();
    window.open = originalOpen;
  });

  it('focuses a live registered window without calling window.open', () => {
    const focus = jest.fn();
    const open = jest.fn();
    window.open = open as typeof window.open;
    registerChatWidgetPopOutWindow({ closed: false, focus } as unknown as Window);

    expect(focusChatWidgetPopOutWindow()).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(open).not.toHaveBeenCalled();
    expect(isChatWidgetPopOutWindowOpen()).toBe(true);
  });

  it('returns false and clears registry when registered window is closed', () => {
    const focus = jest.fn();
    const open = jest.fn();
    window.open = open as typeof window.open;
    registerChatWidgetPopOutWindow({ closed: true, focus } as unknown as Window);

    expect(focusChatWidgetPopOutWindow()).toBe(false);
    expect(focus).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(isChatWidgetPopOutWindowOpen()).toBe(false);
  });

  it('returns false when nothing is registered', () => {
    const open = jest.fn();
    window.open = open as typeof window.open;
    expect(focusChatWidgetPopOutWindow()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
