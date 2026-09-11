import type { PrivacyNoticeSettings } from '@/features/chatbot-config/types/chatbot-config.types';

export const PRIVACY_NOTICE_CONTENT_MAX = 200;
export const PRIVACY_NOTICE_URL_MAX = 2048;
export const PRIVACY_NOTICE_LINK_PHRASES_MAX = 5;

export const DEFAULT_PRIVACY_NOTICE_SETTINGS: PrivacyNoticeSettings = {
  enabled: false,
  content: '',
  url: '',
  linkPhrases: [],
  underlineLinks: false,
  version: 1,
};

const HTTP_URL_RE = /^https?:\/\//i;

export function normalizePrivacyNoticeUrl(raw: string | null | undefined): string {
  const url = String(raw ?? '').trim().slice(0, PRIVACY_NOTICE_URL_MAX);
  if (!url || !HTTP_URL_RE.test(url)) return '';
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return '';
    return url;
  } catch {
    return '';
  }
}

export function normalizePrivacyNoticeLinkPhrases(
  phrases: string[] | null | undefined,
  content: string,
): string[] {
  if (!content || !Array.isArray(phrases)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of phrases) {
    const phrase = String(item ?? '').trim();
    if (!phrase || seen.has(phrase)) continue;
    if (!content.includes(phrase)) continue;
    seen.add(phrase);
    out.push(phrase.slice(0, PRIVACY_NOTICE_CONTENT_MAX));
    if (out.length >= PRIVACY_NOTICE_LINK_PHRASES_MAX) break;
  }
  return out;
}

export function normalizePrivacyNoticeSettings(
  settings: PrivacyNoticeSettings,
): PrivacyNoticeSettings {
  const content = String(settings.content ?? '').trim().slice(0, PRIVACY_NOTICE_CONTENT_MAX);
  const url = normalizePrivacyNoticeUrl(settings.url);
  const linkPhrases = normalizePrivacyNoticeLinkPhrases(settings.linkPhrases, content);
  const version =
    Number.isFinite(settings.version) && settings.version >= 1
      ? Math.floor(settings.version)
      : 1;
  return {
    enabled: Boolean(settings.enabled),
    content,
    url,
    linkPhrases,
    underlineLinks: settings.underlineLinks === true,
    version,
  };
}

/** Returns an i18n key suffix or null when valid for save. */
export function validatePrivacyNoticeForEnable(
  settings: PrivacyNoticeSettings,
): 'content' | 'url' | null {
  if (!settings.enabled) return null;
  const normalized = normalizePrivacyNoticeSettings(settings);
  if (!normalized.content) return 'content';
  if (!normalized.url) return 'url';
  return null;
}
