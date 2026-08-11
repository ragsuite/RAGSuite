import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  cancelLabel: string;
  primaryLabel: string;
  onCancel: () => void;
  onPrimary: () => void;
  primaryLoading?: boolean;
  primaryDisabled?: boolean;
  cancelDisabled?: boolean;
  primaryVariant?: 'primary' | 'danger' | 'cta';
};

/** Standard Cancel + primary footer for all overlays (web dialog footer parity). */
export function OverlayDialogFooter({
  cancelLabel,
  primaryLabel,
  onCancel,
  onPrimary,
  primaryLoading,
  primaryDisabled,
  cancelDisabled,
  primaryVariant = 'cta',
}: Props) {
  const { spacing } = useAppTheme();
  const confirmVariant = primaryVariant === 'danger' ? 'danger' : primaryVariant === 'primary' ? 'primary' : 'cta';

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <AppSecondaryButton label={cancelLabel} onPress={onCancel} size="compact" noTopMargin disabled={cancelDisabled} />
      <AppButton
        label={primaryLabel}
        onPress={onPrimary}
        loading={primaryLoading}
        disabled={primaryDisabled}
        size="compact"
        noTopMargin
        variant={confirmVariant}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
