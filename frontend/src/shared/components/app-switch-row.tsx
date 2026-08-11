import React from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  description?: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  bordered?: boolean;
  /** When bordered is false, use a transparent row background instead of surface. */
  transparentBackground?: boolean;
};

export function AppSwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
  bordered = true,
  transparentBackground = false,
}: Props) {
  const { colors, spacing, radius, typography } = useAppTheme();

  return (
    <View
      style={[
        styles.row,
        bordered && styles.rowBordered,
        {
          minHeight: TOUCH_TARGET_MIN,
          borderRadius: bordered ? radius.sm : 0,
          borderColor: colors.border,
          backgroundColor: bordered || !transparentBackground ? colors.surface : 'transparent',
          paddingHorizontal: bordered ? spacing.sm : 0,
          paddingVertical: spacing.sm,
          opacity: disabled ? 0.55 : 1,
        },
      ]}>
      <View style={[styles.copy, { gap: spacing.xxs }]}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>
        {description ? (
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{description}</Text>
        ) : null}
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled: Boolean(disabled) }}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.textOnPrimary : colors.surface) : colors.surface}
        ios_backgroundColor={colors.surfaceMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowBordered: { borderWidth: 1 },
  copy: { flex: 1, minWidth: 0 },
});
