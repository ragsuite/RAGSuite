import type { LucideIcon } from 'lucide-react-native';
import { Lock } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  onPress: () => void;
  /** CE Enterprise locked teaser — shows Lock glyph beside label. */
  enterpriseLocked?: boolean;
  /** @deprecated Brand sidebar is always paper-sunken / pine-deep. */
  onPrimaryBackground?: boolean;
  /** Brand nav rail styling (default for app drawer). */
  onNeutralSidebar?: boolean;
};

export function DrawerItem({
  label,
  icon: Icon,
  isActive,
  onPress,
  enterpriseLocked = false,
  onPrimaryBackground = false,
  onNeutralSidebar = true,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const brandNav = onNeutralSidebar || !onPrimaryBackground;

  const itemStyle = brandNav
    ? {
        borderRadius: surfaceRadius.button,
        paddingVertical: spacing.xs + 1,
        paddingHorizontal: spacing.sm,
        backgroundColor: isActive ? colors.primaryTint : 'transparent',
        borderLeftWidth: isActive ? 2 : 0,
        borderLeftColor: colors.primary,
        borderColor: 'transparent',
        borderWidth: 0,
      }
    : {
        borderRadius: surfaceRadius.button,
        paddingVertical: spacing.xs + 1,
        paddingHorizontal: spacing.sm,
        backgroundColor: isActive ? colors.primary : colors.surface,
        borderColor: isActive ? colors.primary : colors.border,
        borderWidth: 1,
      };

  const iconColor = brandNav
    ? isActive
      ? colors.onPrimaryTint
      : colors.iconMuted
    : isActive
      ? colors.textOnPrimary
      : colors.textMuted;

  const labelColor = brandNav
    ? isActive
      ? colors.onPrimaryTint
      : colors.sidebarForeground
    : isActive
      ? colors.textOnPrimary
      : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={enterpriseLocked ? `${label} (Enterprise)` : label}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.item,
        itemStyle,
        (pressed || hovered) && brandNav && !isActive ? { backgroundColor: colors.primaryTint } : null,
        pressed && !brandNav && !isActive ? { backgroundColor: colors.surfaceMuted } : null,
        hovered && !brandNav && !isActive ? { backgroundColor: colors.surfaceHover } : null,
      ]}>
      <Icon size={16} color={iconColor} />
      <Text style={[typography.body, styles.label, { color: labelColor, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {enterpriseLocked ? <Lock size={14} color={isActive && brandNav ? colors.onPrimaryTint : colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
  },
  label: {
    fontWeight: '500',
  },
});
