import { ar, de, en, enGb, es, fr, hi, pt, zh } from '@/i18n/locales';

export const I18N_STORAGE_KEY = 'i18n';

export const AVAILABLE_LOCALES = [
  { code: 'en', name: 'English (US)', flag: '🇺🇸', countryCode: 'US' },
  { code: 'en-gb', name: 'English (UK)', flag: '🇬🇧', countryCode: 'GB' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳', countryCode: 'IN' },
  { code: 'es', name: 'Español', flag: '🇪🇸', countryCode: 'ES' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', countryCode: 'FR' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', countryCode: 'DE' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', countryCode: 'SA' },
  { code: 'pt', name: 'Português (Brasil)', flag: '🇧🇷', countryCode: 'BR' },
  { code: 'zh', name: '中文 (简体)', flag: '🇨🇳', countryCode: 'CN' },
] as const;

export type AppLocaleCode = (typeof AVAILABLE_LOCALES)[number]['code'];

export const translations: Record<string, Record<string, string>> = {
  en,
  'en-gb': enGb,
  es,
  fr,
  de,
  zh,
  pt,
  ar,
  hi,
};

const LOCALE_CODES = new Set<string>(AVAILABLE_LOCALES.map((locale) => locale.code));

export function isAppLocaleCode(code: string): code is AppLocaleCode {
  return LOCALE_CODES.has(code);
}

export function getLocaleLabel(code: string) {
  const locale = AVAILABLE_LOCALES.find((item) => item.code === code);
  return locale ? `${locale.flag} ${locale.name}` : code;
}

export function isRtlLocale(locale: string) {
  return ['ar', 'he', 'fa', 'ur'].includes(locale.split('-')[0]);
}

export function detectBrowserLocale(): AppLocaleCode | null {
  if (typeof navigator === 'undefined') return null;

  const language = navigator.language ?? navigator.languages?.[0];
  if (!language) return null;

  const full = language.toLowerCase();

  if (full === 'en-gb' || full === 'en-uk') return 'en-gb';
  if (full.startsWith('zh')) return 'zh';
  if (full.startsWith('pt')) return 'pt';

  const exact = AVAILABLE_LOCALES.find((locale) => locale.code.toLowerCase() === full);
  if (exact) return exact.code;

  const browserLang = full.split('-')[0];
  const supported = AVAILABLE_LOCALES.find((locale) => locale.code.startsWith(browserLang));
  return supported?.code ?? null;
}
