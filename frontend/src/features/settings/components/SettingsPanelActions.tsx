import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  saving?: boolean;
  saveDisabled?: boolean;
  resetDisabled?: boolean;
  onReset: () => void;
  onSave: () => void;
};

/** Shared Settings panel footer: Reset + Save Changes, right-aligned. */
export function SettingsPanelActions({
  saving = false,
  saveDisabled = false,
  resetDisabled = false,
  onReset,
  onSave,
}: Props) {
  const { spacing } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.actions, { gap: spacing.sm, paddingTop: spacing.lg }]}>
      <AppSecondaryButton
        label={t('settings.actions.reset')}
        onPress={onReset}
        disabled={resetDisabled || saving}
      />
      <AppButton
        label={saving ? t('common.saving') : t('settings.actions.saveChanges')}
        onPress={onSave}
        loading={saving}
        disabled={saveDisabled || saving}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
});
