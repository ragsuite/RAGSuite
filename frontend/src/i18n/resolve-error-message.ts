import { translations } from '@/i18n/constants';

const I18N_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/i;

/** True when `message` is likely an i18n key we should pass through `t()`. */
export function isLikelyI18nKey(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.includes(' ')) return false;
  if (!I18N_KEY_PATTERN.test(trimmed)) return false;
  return Boolean(translations.en[trimmed]);
}

export function resolveAppErrorMessage(
  error: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
  fallbackKey = 'common.error',
): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (isLikelyI18nKey(message)) {
      return t(message);
    }
    if (message) return message;
  }
  return t(fallbackKey);
}
