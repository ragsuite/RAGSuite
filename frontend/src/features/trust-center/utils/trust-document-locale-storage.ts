import type { TrustLocale } from '@/features/trust-center/content';

const STORAGE_KEY = 'trust-center-document-locale';

export function readStoredTrustDocumentLocale(): TrustLocale | null {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }
  const value = localStorage.getItem(STORAGE_KEY);
  return value === 'de' || value === 'en' ? value : null;
}

export function writeStoredTrustDocumentLocale(locale: TrustLocale): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  localStorage.setItem(STORAGE_KEY, locale);
}
