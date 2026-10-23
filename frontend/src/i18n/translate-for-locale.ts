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

export function interpolateTranslation(
  template: string,
  params?: Record<string, string | number>,
): string {
  if (!params) return template;
  let out = template;
  for (const [param, value] of Object.entries(params)) {
    const text = String(value);
    out = out.split(`{{${param}}}`).join(text);
    out = out.split(`{${param}}`).join(text);
  }
  return out;
}

export function translateForLocale(
  localeCode: string | null | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  const locale = normalizeAppLocale(localeCode);
  const table = translations[locale] || translations.en;
  const translation = table[key] ?? translations.en[key] ?? key;
  return interpolateTranslation(translation, params);
}

/** Translator bound to a product language (widget / search box), not the app chrome locale. */
export function createTranslatorForLanguage(localeCode: string | null | undefined): TranslateFn {
  return (key, params) => translateForLocale(localeCode, key, params);
}
