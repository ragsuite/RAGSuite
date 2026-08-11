import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  saveLabel?: string;
  onSave: () => void;
  onDiscard: () => void;
};

export function ModuleSaveBar({
  visible,
  saving,
  saveDisabled,
  saveLabel,
  onSave,
  onDiscard,
}: Props) {
  const { spacing } = useAppTheme();
  const { t } = useTranslation();
  const resolvedSaveLabel = saveLabel ?? t('moduleSaveBar.saveChanges');

  if (!visible) return null;

  return (
    <View style={[styles.actions, { gap: spacing.sm }]}>
      <AppButton label={t('common.discard')} size="compact" variant="outline" disabled={Boolean(saving)} onPress={onDiscard} />
      <AppButton
        label={resolvedSaveLabel}
        size="compact"
        variant="cta"
        loading={saving}
        disabled={Boolean(saveDisabled)}
        onPress={onSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
