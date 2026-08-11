type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

function resolveIntlLocale(locale?: string) {
  return locale === 'en-gb' ? 'en-GB' : locale;
}

export function formatProjectCreatedDate(
  iso: string,
  t?: TranslateFn,
  locale?: string,
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t?.('projects.date.unknown') ?? 'Unknown date';
  }
  return date.toLocaleDateString(resolveIntlLocale(locale), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const PROJECT_DESCRIPTION_MAX = 500;
