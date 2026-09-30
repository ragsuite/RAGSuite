import React from 'react';
import { View } from 'react-native';

import { AppSelectField } from '@/shared/components/app-select-field';
import { SettingsPanelActions } from '@/features/settings/components/SettingsPanelActions';
import { getLocaleLabel, toSettingsLocaleSelectOptions } from '@/features/settings/data/settings-locale-options';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  saving?: boolean;
  onSave: () => void;
};

const LOCALE_OPTIONS = toSettingsLocaleSelectOptions();
const LANGUAGE_FIELD_MAX_WIDTH = 400;

export function SettingsI18nPanel({ saving = false, onSave }: Props) {
  const { spacing } = useAppTheme();
  const { locale, setLocale, t } = useTranslation();

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ maxWidth: LANGUAGE_FIELD_MAX_WIDTH, width: '100%' }}>
        <AppSelectField
          label={t('settings.i18n.defaultLanguage')}
          value={locale}
          options={LOCALE_OPTIONS}
          onChange={(value) => setLocale(value as typeof locale)}
          placeholder={t('common.selectLanguage')}
          accessibilityLabel={t('settings.i18n.defaultLanguage')}
          showSelectedCheckmark
        />
      </View>

      <SettingsPanelActions
        saving={saving}
        onReset={() => setLocale('en')}
        onSave={onSave}
      />
    </View>
  );
}

export { getLocaleLabel };
