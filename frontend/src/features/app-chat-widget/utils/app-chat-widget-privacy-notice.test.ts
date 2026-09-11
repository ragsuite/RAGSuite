import {
  acceptPrivacyNotice,
  buildPrivacyNoticeBodySegments,
  hasAcceptedPrivacyNotice,
  privacyNoticeAcceptanceKey,
  shouldShowPrivacyNoticeGate,
} from '@/features/app-chat-widget/utils/app-chat-widget-privacy-notice';
import { DEFAULT_PRIVACY_NOTICE_SETTINGS } from '@/features/chatbot-config/utils/privacy-notice-settings';

describe('app-chat-widget-privacy-notice', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, String(value));
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
        clear: () => store.clear(),
      },
    });
  });

  it('builds acceptance keys per project and version', () => {
    expect(privacyNoticeAcceptanceKey('proj-1', 2)).toContain('proj-1');
    expect(privacyNoticeAcceptanceKey('proj-1', 2)).toContain('v2');
  });

  it('persists acceptance in localStorage', () => {
    expect(hasAcceptedPrivacyNotice('proj-1', 1)).toBe(false);
    acceptPrivacyNotice('proj-1', 1);
    expect(hasAcceptedPrivacyNotice('proj-1', 1)).toBe(true);
    expect(hasAcceptedPrivacyNotice('proj-1', 2)).toBe(false);
  });

  it('splits body into text and link segments', () => {
    const segments = buildPrivacyNoticeBodySegments(
      'Read our privacy policy today.',
      ['privacy policy'],
    );
    expect(segments).toEqual([
      { type: 'text', value: 'Read our ' },
      { type: 'link', value: 'privacy policy' },
      { type: 'text', value: ' today.' },
    ]);
  });

  it('gates when enabled and not accepted', () => {
    const notice = {
      ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
      enabled: true,
      content: 'Hi',
      url: 'https://example.com',
      version: 1,
    };
    expect(
      shouldShowPrivacyNoticeGate({
        notice,
        projectId: 'p1',
        isOpen: true,
        previewMode: false,
      }),
    ).toBe(true);
    acceptPrivacyNotice('p1', 1);
    expect(
      shouldShowPrivacyNoticeGate({
        notice,
        projectId: 'p1',
        isOpen: true,
        previewMode: false,
      }),
    ).toBe(false);
    expect(
      shouldShowPrivacyNoticeGate({
        notice,
        projectId: 'p1',
        isOpen: true,
        previewMode: true,
      }),
    ).toBe(true);
  });
});
