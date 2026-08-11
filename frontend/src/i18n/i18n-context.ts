import { createContext } from 'react';

import { AVAILABLE_LOCALES, type AppLocaleCode } from '@/i18n/constants';

export type I18nContextValue = {
  locale: AppLocaleCode;
  setLocale: (locale: AppLocaleCode) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  availableLocales: typeof AVAILABLE_LOCALES;
  isRTL: boolean;
};

export const I18nContext = createContext<I18nContextValue | null>(null);
