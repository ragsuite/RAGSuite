/** Locale-aware formatting helpers (reference uses `Intl` with active UI locale). */

function resolveIntlLocale(locale: string) {
  return locale === 'en-gb' ? 'en-GB' : locale;
}

export function formatDate(
  locale: string,
  value: Date | string | number,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(resolveIntlLocale(locale), options).format(date);
}

export function formatNumber(locale: string, value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(resolveIntlLocale(locale), options).format(value);
}

export function formatRelativeTime(locale: string, value: number, unit: Intl.RelativeTimeFormatUnit) {
  return new Intl.RelativeTimeFormat(resolveIntlLocale(locale), { numeric: 'auto' }).format(value, unit);
}
