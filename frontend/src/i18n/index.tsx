import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { I18nManager, Platform } from 'react-native';

import {
  AVAILABLE_LOCALES,
  detectBrowserLocale,
  isAppLocaleCode,
  isRtlLocale,
  translations,
  I18N_STORAGE_KEY,
  type AppLocaleCode,
} from '@/i18n/constants';
import { readStoredLocale, writeStoredLocale } from '@/i18n/storage';
import { I18nContext, type I18nContextValue } from '@/i18n/i18n-context';

export {
  AVAILABLE_LOCALES,
  getLocaleLabel,
  isAppLocaleCode,
  isRtlLocale,
  type AppLocaleCode,
} from '@/i18n/constants';
export * from '@/i18n/formatters';
export * from '@/i18n/resolve-header-meta';
export * from '@/i18n/resolve-error-message';
export * from '@/i18n/translate-for-locale';
export { useI18n, useTranslation } from '@/i18n/use-translation';
export { useLocalizedDrawerNav } from '@/i18n/use-localized-navigation';
export type { I18nContextValue } from '@/i18n/i18n-context';

type Props = {
  children: React.ReactNode;
};

function readInitialLocale(): AppLocaleCode {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(I18N_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { locale?: string };
        if (parsed.locale && isAppLocaleCode(parsed.locale)) {
          return parsed.locale;
        }
      }
      const detected = detectBrowserLocale();
      if (detected) return detected;
    } catch {
      // ignore
    }
  }
  return 'en';
}

function applyDocumentLocale(locale: AppLocaleCode) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const rtl = isRtlLocale(locale);
  document.documentElement.lang = locale;
  document.documentElement.dir = rtl ? 'rtl' : 'ltr';
}

function applyNativeRtl(locale: AppLocaleCode) {
  if (Platform.OS === 'web') return;
  const rtl = isRtlLocale(locale);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
  }
}

export function I18nProvider({ children }: Props) {
  const [locale, setLocaleState] = useState<AppLocaleCode>(readInitialLocale);
  const [hydrated, setHydrated] = useState(Platform.OS === 'web');

  useLayoutEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      const saved = await readStoredLocale();
      if (cancelled) return;
      if (saved) {
        setLocaleState(saved);
      } else {
        const detected = detectBrowserLocale();
        if (detected) {
          setLocaleState(detected);
        }
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: AppLocaleCode) => {
    setLocaleState(next);
    void writeStoredLocale(next);
    applyDocumentLocale(next);
    applyNativeRtl(next);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void writeStoredLocale(locale);
    applyDocumentLocale(locale);
    applyNativeRtl(locale);
  }, [hydrated, locale]);

  const t = useMemo(() => {
    return (key: string, params?: Record<string, string | number>) => {
      const table = translations[locale] || translations.en;
      let translation = table[key] ?? translations.en[key] ?? key;

      if (params) {
        Object.entries(params).forEach(([param, value]) => {
          translation = translation.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
        });
      }

      return translation;
    };
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t,
      availableLocales: AVAILABLE_LOCALES,
      isRTL: isRtlLocale(locale),
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
