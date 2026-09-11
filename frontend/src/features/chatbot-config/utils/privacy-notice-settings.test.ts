import {
  DEFAULT_PRIVACY_NOTICE_SETTINGS,
  normalizePrivacyNoticeLinkPhrases,
  normalizePrivacyNoticeSettings,
  normalizePrivacyNoticeUrl,
  validatePrivacyNoticeForEnable,
  PRIVACY_NOTICE_CONTENT_MAX,
  PRIVACY_NOTICE_LINK_PHRASES_MAX,
} from '@/features/chatbot-config/utils/privacy-notice-settings';

describe('privacy-notice-settings', () => {
  it('rejects non-http urls', () => {
    expect(normalizePrivacyNoticeUrl('https://ok.example/privacy')).toBe('https://ok.example/privacy');
    expect(normalizePrivacyNoticeUrl('ftp://x')).toBe('');
    expect(normalizePrivacyNoticeUrl('example.com')).toBe('');
  });

  it('keeps only exact substrings and caps phrase count', () => {
    const content = 'a b c d e f privacy';
    expect(normalizePrivacyNoticeLinkPhrases(['privacy', 'missing', 'a'], content)).toEqual([
      'privacy',
      'a',
    ]);
    const many = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(normalizePrivacyNoticeLinkPhrases(many, content)).toHaveLength(
      PRIVACY_NOTICE_LINK_PHRASES_MAX,
    );
  });

  it('trims content to max length', () => {
    const long = 'x'.repeat(PRIVACY_NOTICE_CONTENT_MAX + 20);
    const normalized = normalizePrivacyNoticeSettings({
      ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
      content: long,
      url: 'https://example.com/p',
    });
    expect(normalized.content).toHaveLength(PRIVACY_NOTICE_CONTENT_MAX);
  });

  it('defaults underlineLinks to off', () => {
    expect(DEFAULT_PRIVACY_NOTICE_SETTINGS.underlineLinks).toBe(false);
    expect(
      normalizePrivacyNoticeSettings({
        ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
        underlineLinks: undefined as unknown as boolean,
      }).underlineLinks,
    ).toBe(false);
    expect(
      normalizePrivacyNoticeSettings({
        ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
        underlineLinks: true,
      }).underlineLinks,
    ).toBe(true);
  });

  it('validates required fields when enabled', () => {
    expect(
      validatePrivacyNoticeForEnable({
        ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
        enabled: true,
        content: '',
        url: 'https://example.com',
      }),
    ).toBe('content');
    expect(
      validatePrivacyNoticeForEnable({
        ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
        enabled: true,
        content: 'Hello',
        url: '',
      }),
    ).toBe('url');
    expect(
      validatePrivacyNoticeForEnable({
        ...DEFAULT_PRIVACY_NOTICE_SETTINGS,
        enabled: true,
        content: 'Hello',
        url: 'https://example.com',
      }),
    ).toBeNull();
  });
});
