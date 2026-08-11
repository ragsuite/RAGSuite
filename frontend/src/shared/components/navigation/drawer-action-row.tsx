import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  icon: LucideIcon;
  value?: React.ReactNode;
  valueLabel?: string;
  showChevron?: boolean;
  onPress: () => void;
  onPrimaryBackground?: boolean;
  onNeutralSidebar?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

export function DrawerActionRow({
  label,
  icon: Icon,
  value,
  valueLabel,
  showChevron = true,
  onPress,
  onPrimaryBackground = false,
  onNeutralSidebar = false,
  accessibilityLabel,
  testID,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  const mutedColor = onPrimaryBackground ? 'rgba(255,255,255,0.72)' : onNeutralSidebar ? colors.textMuted : colors.textMuted;
  const foregroundColor = onPrimaryBackground ? 'rgba(255,255,255,0.92)' : onNeutralSidebar ? colors.sidebarForeground : colors.text;
  const iconColor = onPrimaryBackground ? 'rgba(255,255,255,0.78)' : onNeutralSidebar ? colors.textMuted : colors.textMuted;

  const baseItemStyle = onPrimaryBackground
    ? {
        borderRadius: surfaceRadius.button,
        paddingVertical: spacing.xs + 1,
        paddingHorizontal: spacing.sm,
        backgroundColor: 'transparent' as const,
      }
    : onNeutralSidebar
      ? {
          borderRadius: surfaceRadius.button,
          paddingVertical: spacing.xs + 1,
          paddingHorizontal: spacing.sm,
          backgroundColor: 'transparent' as const,
        }
      : {
          borderRadius: surfaceRadius.button,
          paddingVertical: spacing.xs + 1,
          paddingHorizontal: spacing.sm,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: 1,
        };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.item,
        baseItemStyle,
        (pressed || hovered) && onPrimaryBackground
          ? { backgroundColor: 'rgba(255,255,255,0.08)' }
          : (pressed || hovered) && onNeutralSidebar
            ? { backgroundColor: 'rgba(255,255,255,0.06)' }
            : (pressed || hovered) && !onPrimaryBackground && !onNeutralSidebar
              ? { backgroundColor: colors.surfaceMuted }
              : null,
      ]}>
      <Icon size={16} color={iconColor} />
      <Text style={[typography.body, styles.label, { color: foregroundColor, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {value ? <View style={styles.valueSlot}>{value}</View> : null}
      {valueLabel ? (
        <Text style={[typography.caption, styles.valueLabel, { color: mutedColor }]} numberOfLines={1}>
          {valueLabel}
        </Text>
      ) : null}
      {showChevron ? <ChevronRight size={16} color={mutedColor} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
  },
  label: {
    fontWeight: '500',
  },
  valueSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueLabel: {
    maxWidth: 120,
    fontWeight: '500',
  },
});
