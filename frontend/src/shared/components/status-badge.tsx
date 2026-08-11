import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type StatusBadgeTone =
  | 'active'
  | 'inactive'
  | 'success'
  | 'muted'
  | 'warning'
  | 'danger'
  | 'default';

export type StatusBadgeSize = 'default' | 'compact';

type Props = {
  label: string;
  tone?: StatusBadgeTone;
  size?: StatusBadgeSize;
  preserveCase?: boolean;
};

export function StatusBadge({
  label,
  tone = 'default',
  size = 'default',
  preserveCase = false,
}: Props) {
  const { colors, radius, typography } = useAppTheme();

  const palette = {
    active: { bg: colors.primaryTint, text: colors.success, border: colors.primaryTint },
    inactive: { bg: colors.surfaceMuted, text: colors.textMuted, border: 'transparent' },
    success: { bg: colors.primaryTint, text: colors.success, border: colors.primaryTint },
    muted: { bg: colors.surfaceMuted, text: colors.textMuted, border: 'transparent' },
    warning: { bg: colors.ochreTint, text: colors.warning, border: colors.ochreTint },
    danger: { bg: colors.dangerBackground, text: colors.danger, border: colors.dangerBackground },
    default: { bg: colors.surfaceMuted, text: colors.textSoft, border: colors.border },
  }[tone];

  const compact = size === 'compact';

  return (
    <View
      style={[
        styles.badge,
        compact ? styles.badgeCompact : null,
        {
          borderRadius: radius.pill,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}>
      <Text
        style={[
          typography.caption,
          compact ? styles.labelCompact : styles.label,
          { color: palette.text },
          preserveCase ? styles.preserveCase : null,
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeCompact: {
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  label: {
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  labelCompact: {
    fontWeight: '500',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  preserveCase: {
    textTransform: 'none',
  },
});
