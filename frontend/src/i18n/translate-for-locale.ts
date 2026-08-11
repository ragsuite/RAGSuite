import {
  isAppLocaleCode,
  translations,
  type AppLocaleCode,
} from '@/i18n/constants';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

/**
 * Map chatbot / search-box language codes onto app locale tables.
 * Falls back to English when unsupported.
 */
export function normalizeAppLocale(code: string | null | undefined): AppLocaleCode {
  const raw = (code ?? '').trim().toLowerCase();
  if (!raw) return 'en';

  if (raw === 'en-us' || raw === 'en_us') return 'en';
  if (raw === 'en-uk' || raw === 'en_uk') return 'en-gb';
  if (raw === 'pt-br' || raw === 'pt_br') return 'pt';
  if (raw === 'zh-cn' || raw === 'zh_cn' || raw === 'zh-hans') return 'zh';

  if (isAppLocaleCode(raw)) return raw;

  const base = raw.split(/[-_]/)[0] ?? raw;
  if (isAppLocaleCode(base)) return base;

  return 'en';
}

export function translateForLocale(
  localeCode: string | null | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const locale = normalizeAppLocale(localeCode);
  const table = translations[locale] || translations.en;
  let translation = table[key] ?? translations.en[key] ?? key;

  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      translation = translation.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
    });
  }

  return translation;
}

/** Translator bound to a product language (widget / search box), not the app chrome locale. */
export function createTranslatorForLanguage(localeCode: string | null | undefined): TranslateFn {
  return (key, params) => translateForLocale(localeCode, key, params);
}
