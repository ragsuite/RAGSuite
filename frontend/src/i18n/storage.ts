import { Platform } from 'react-native';

import { I18N_STORAGE_KEY, isAppLocaleCode, type AppLocaleCode } from '@/i18n/constants';
import { storage } from '@/services/storage/storage';

type StoredI18n = { locale?: string };

/** Web uses raw `localStorage` key `i18n` for reference frontend parity. */
function readWebI18n(): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(I18N_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeWebI18n(value: string) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(I18N_STORAGE_KEY, value);
  } catch {
    // ignore
  }
}

export async function readStoredLocale(): Promise<AppLocaleCode | null> {
  try {
    const raw = Platform.OS === 'web' ? readWebI18n() : await storage.getItem(I18N_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredI18n;
    if (parsed.locale && isAppLocaleCode(parsed.locale)) {
      return parsed.locale;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function writeStoredLocale(locale: AppLocaleCode): Promise<void> {
  const payload = JSON.stringify({ locale });
  if (Platform.OS === 'web') {
    writeWebI18n(payload);
    return;
  }
  await storage.setItem(I18N_STORAGE_KEY, payload);
}
