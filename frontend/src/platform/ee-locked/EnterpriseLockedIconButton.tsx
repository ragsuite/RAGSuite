import { Lock } from 'lucide-react-native';
import React from 'react';
import { Linking, Platform, Pressable, StyleSheet } from 'react-native';

import { useTranslation } from '@/i18n';
import { ENTERPRISE_PRICING_URL } from '@/platform/ee-locked/enterprise-pricing-url';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  accessibilityLabel?: string;
  disabled?: boolean;
  controlHeight?: number;
  /** Compact size for picker option rows (default full toolbar height). */
  size?: 'default' | 'compact';
};

/**
 * Toolbar-sized lock button for CE stubs — opens the edition comparison page.
 * Always full opacity: the lock is the EE affordance and must not look disabled.
 */
export function EnterpriseLockedIconButton({
  accessibilityLabel,
  disabled: _disabled = false,
  controlHeight,
  size = 'default',
}: Props) {
  const { t } = useTranslation();
  const { colors, surfaceRadius } = useAppTheme();
  const resolvedHeight =
    controlHeight ?? (size === 'compact' ? 28 : TOOLBAR_CONTROL_HEIGHT);
  const iconSize = size === 'compact' ? 14 : 16;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={
        accessibilityLabel ??
        t('enterprise.locked.openPricing.a11y', {
          defaultValue: 'Open RAGSuite Enterprise pricing comparison',
        })
      }
      hitSlop={size === 'compact' ? 6 : 0}
      onPress={(event) => {
        // Prevent parent picker row from swallowing the press.
        event?.stopPropagation?.();
        void Linking.openURL(ENTERPRISE_PRICING_URL);
      }}
      style={({ pressed }) => [
        styles.iconBtn,
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null,
        {
          width: resolvedHeight,
          height: resolvedHeight,
          borderRadius: surfaceRadius.button,
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          opacity: 1,
        },
      ]}>
      <Lock size={iconSize} color={colors.primary} strokeWidth={2.25} />
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
