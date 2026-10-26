import React from 'react';
import { View } from 'react-native';

import { AppSelectField } from '@/shared/components/app-select-field';
import { SettingsPanelActions } from '@/features/settings/components/SettingsPanelActions';
import { getLocaleLabel, toSettingsLocaleSelectOptions } from '@/features/settings/data/settings-locale-options';
import { useTranslation } from '@/i18n';
import { useConfirm } from '@/shared/confirm/confirm-provider';
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
  const { confirm } = useConfirm();

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
        onReset={() => {
          void (async () => {
            const confirmed = await confirm({
              title: t('settings.i18n.confirm.reset.title'),
              message: t('settings.i18n.confirm.reset.message'),
              cancelLabel: t('common.cancel'),
              confirmLabel: t('settings.i18n.confirm.reset.action'),
              variant: 'warning',
            });
            if (confirmed) setLocale('en');
          })();
        }}
        onSave={onSave}
      />
    </View>
  );
}

export { getLocaleLabel };
