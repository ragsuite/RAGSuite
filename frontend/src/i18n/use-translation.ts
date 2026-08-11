import { useContext } from 'react';

import { I18nContext } from '@/i18n/i18n-context';

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}

/** Reference-compatible alias used across the web frontend. */
export function useTranslation() {
  const { t, locale, setLocale, availableLocales, isRTL } = useI18n();
  return {
    t,
    locale,
    setLocale,
    availableLocales,
    isRTL,
    changeLanguage: setLocale,
  };
}
