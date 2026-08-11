import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  noteTone?: 'default' | 'danger';
  valueTone?: 'default' | 'success' | 'danger';
};

export function FeedbackCompactKpiCard({
  label,
  value,
  note,
  icon: Icon,
  noteTone = 'default',
  valueTone = 'default',
}: Props) {
  const { colors, spacing, surfaceRadius, isWebParitySurfaces, typography, elevation } = useAppTheme();
  const cardRadius = surfaceRadius.card;
  const valueColor =
    valueTone === 'success' ? colors.success : valueTone === 'danger' ? colors.danger : colors.text;

  return (
    <View
      style={[
        styles.card,
        elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: cardRadius,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
          gap: 4,
        },
      ]}>
      <View style={styles.topRow}>
        <Text style={[typography.eyebrow, styles.label, { color: colors.textSoft }]} numberOfLines={2}>
          {label}
        </Text>
        <Icon size={15} color={colors.textSoft} />
      </View>
      <Text
        style={[typography.metric, styles.value, { color: valueColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {value}
      </Text>
      {note ? (
        <Text
          style={[
            typography.caption,
            {
              color: noteTone === 'danger' ? colors.danger : colors.textMuted,
              fontWeight: noteTone === 'danger' ? '600' : '400',
            },
          ]}
          numberOfLines={2}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minWidth: 0,
    borderWidth: 1,
    minHeight: 88,
    flexGrow: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 4,
  },
  label: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
  },
  value: {
    fontSize: 22,
    lineHeight: 26,
  },
});
