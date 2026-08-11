import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { getLocaleLabel, toSettingsLocaleSelectOptions } from '@/features/settings/data/settings-locale-options';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  saving?: boolean;
  onSave: () => void;
};

const LOCALE_OPTIONS = toSettingsLocaleSelectOptions();

export function SettingsI18nPanel({ saving = false, onSave }: Props) {
  const { spacing } = useAppTheme();
  const { locale, setLocale, t } = useTranslation();

  return (
    <View style={{ gap: spacing.md }}>
      <AppSelectField
        label={t('settings.i18n.defaultLanguage')}
        value={locale}
        options={LOCALE_OPTIONS}
        onChange={(value) => setLocale(value as typeof locale)}
        placeholder={t('common.selectLanguage')}
        accessibilityLabel={t('settings.i18n.defaultLanguage')}
        showSelectedCheckmark
      />

      <View style={[styles.actions, { gap: spacing.sm }]}>
        <AppSecondaryButton
          label={t('settings.actions.reset')}
          onPress={() => setLocale('en')}
        />
        <AppButton
          label={t('settings.actions.saveChanges')}
          onPress={onSave}
          loading={saving}
        />
      </View>
    </View>
  );
}

export { getLocaleLabel };

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
});
