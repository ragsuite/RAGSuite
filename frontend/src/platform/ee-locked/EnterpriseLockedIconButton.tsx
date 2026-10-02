import { Lock } from 'lucide-react-native';
import React from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';

import { ENTERPRISE_PRICING_URL } from '@/platform/ee-locked/enterprise-pricing-url';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  accessibilityLabel: string;
  disabled?: boolean;
  controlHeight?: number;
};

/**
 * Toolbar-sized lock button for CE stubs — opens the edition comparison page.
 * Always full opacity: the lock is the EE affordance and must not look disabled.
 */
export function EnterpriseLockedIconButton({
  accessibilityLabel,
  disabled: _disabled = false,
  controlHeight = TOOLBAR_CONTROL_HEIGHT,
}: Props) {
  const { colors, surfaceRadius } = useAppTheme();

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={() => {
        void Linking.openURL(ENTERPRISE_PRICING_URL);
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        {
          width: controlHeight,
          height: controlHeight,
          borderRadius: surfaceRadius.button,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          opacity: 1,
        },
      ]}>
      <Lock size={16} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
});
