import {
  AVAILABLE_LOCALES,
  getLocaleLabel,
  isAppLocaleCode,
  type AppLocaleCode,
} from '@/i18n/constants';

export const SETTINGS_LOCALE_OPTIONS = AVAILABLE_LOCALES;

export type SettingsLocaleCode = AppLocaleCode;

export const LANGUAGE_OPTIONS = SETTINGS_LOCALE_OPTIONS.map((locale) => locale.code);

export { getLocaleLabel, isAppLocaleCode as isSettingsLocaleCode };

export function toSettingsLocaleSelectOptions() {
  return SETTINGS_LOCALE_OPTIONS.map((locale) => ({
    key: locale.code,
    label: locale.name,
  }));
}
