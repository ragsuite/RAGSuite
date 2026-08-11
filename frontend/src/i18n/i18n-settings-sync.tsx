import { useEffect, useRef } from 'react';

import { useSettings } from '@/features/settings/hooks/useSettings';
import { isAppLocaleCode } from '@/i18n/constants';
import { useI18n } from '@/i18n/index';
import { readStoredLocale } from '@/i18n/storage';

/** Keeps UI locale (`i18n` storage) and settings intl preference aligned. */
export function I18nSettingsSync() {
  const { locale, setLocale } = useI18n();
  const { settings, loading, updateIntl } = useSettings();
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (loading || bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    void (async () => {
      const stored = await readStoredLocale();
      if (stored) return;
      if (isAppLocaleCode(settings.intl.language) && settings.intl.language !== locale) {
        setLocale(settings.intl.language);
      }
    })();
  }, [loading, locale, setLocale, settings.intl.language]);

  useEffect(() => {
    if (!isAppLocaleCode(locale) || settings.intl.language === locale) return;
    void updateIntl({ ...settings.intl, language: locale }, { silent: true });
  }, [locale, settings.intl, updateIntl]);

  return null;
}
