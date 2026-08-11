import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  label?: string;
  saveKey?: string;
  savingKey?: string;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  onPress: () => void;
};

export function SearchConfigSaveButton({
  label,
  saveKey = 'search.config.save',
  savingKey = 'search.config.saving',
  disabled,
  loading,
  fullWidth = false,
  onPress,
}: Props) {
  const { t } = useTranslation();
  const resolvedLabel = label ?? (loading ? t(savingKey) : t(saveKey));

  const button = (
    <AppButton
      label={resolvedLabel}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      fullWidth={fullWidth}
      size="compact"
      variant="cta"
      icon={ActionIcons.save}
    />
  );

  if (fullWidth) {
    return button;
  }

  return <View style={styles.alignStart}>{button}</View>;
}

const styles = StyleSheet.create({
  alignStart: {
    alignSelf: 'flex-start',
  },
});
