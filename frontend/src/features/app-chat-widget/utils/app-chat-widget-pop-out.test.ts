import {
  isStandalonePopOutParam,
  openChatWidgetPopOut,
} from '@/features/app-chat-widget/utils/app-chat-widget-pop-out';
import {
  clearChatWidgetPopOutWindow,
  focusChatWidgetPopOutWindow,
  isChatWidgetPopOutWindowOpen,
} from '@/features/app-chat-widget/utils/app-chat-widget-pop-out-sync';

describe('isStandalonePopOutParam', () => {
  it('accepts truthy pop flags', () => {
    expect(isStandalonePopOutParam('1')).toBe(true);
    expect(isStandalonePopOutParam('true')).toBe(true);
    expect(isStandalonePopOutParam(['yes'])).toBe(true);
  });

  it('rejects missing or falsey flags', () => {
    expect(isStandalonePopOutParam(undefined)).toBe(false);
    expect(isStandalonePopOutParam('0')).toBe(false);
    expect(isStandalonePopOutParam('')).toBe(false);
  });
});

describe('openChatWidgetPopOut', () => {
  const originalOpen = window.open;
  const originalLocation = window.location;
  const originalScreen = window.screen;

  beforeEach(() => {
    clearChatWidgetPopOutWindow();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { origin: 'https://admin.example.com' },
    });
    Object.defineProperty(window, 'screen', {
      configurable: true,
      value: { width: 1400, height: 900 },
    });
  });

  afterEach(() => {
    clearChatWidgetPopOutWindow();
    window.open = originalOpen;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    Object.defineProperty(window, 'screen', {
      configurable: true,
      value: originalScreen,
    });
  });

  it('opens embed chatbot URL with project, api, session, and pop=1', () => {
    const focus = jest.fn();
    const popup = { closed: false, focus } as unknown as Window;
    const open = jest.fn(() => popup);
    window.open = open as typeof window.open;

    const ok = openChatWidgetPopOut({
      projectId: 'proj-1',
      sessionId: 'sess-9',
    });

    expect(ok).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    const openedUrl = String((open.mock.calls as unknown as [string][])[0]?.[0] ?? '');
    expect(openedUrl).toContain('https://admin.example.com/embed/chatbot?');
    expect(openedUrl).toContain('projectId=proj-1');
    expect(openedUrl).toContain('sessionId=sess-9');
    expect(openedUrl).toContain('apiEndpoint=');
    expect(openedUrl).toContain('pop=1');
    expect(isChatWidgetPopOutWindowOpen()).toBe(true);
    expect(focusChatWidgetPopOutWindow()).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('returns false without projectId', () => {
    const open = jest.fn();
    window.open = open as typeof window.open;
    expect(openChatWidgetPopOut({ projectId: '  ' })).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
