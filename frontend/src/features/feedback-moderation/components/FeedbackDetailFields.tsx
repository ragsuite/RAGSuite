import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFeedbackLayout } from '@/features/feedback-moderation/utils/feedback-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function FeedbackFieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={{
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surfaceMuted,
          padding: spacing.sm,
        }}>
        {children}
      </View>
    </View>
  );
}

export function FeedbackMetaCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { colors, typography, spacing, surfaceRadius } = useAppTheme();
  const { isNativeMobile } = useFeedbackLayout();

  return (
    <View
      style={[
        styles.metaCell,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
          backgroundColor: colors.surfaceMuted,
          padding: spacing.sm,
          minWidth: isNativeMobile ? undefined : 120,
          flex: isNativeMobile ? undefined : 1,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          typography.caption,
          {
            color: highlight ? colors.primary : colors.text,
            fontWeight: '500',
          },
        ]}
        numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metaCell: {
    borderWidth: 1,
    gap: 4,
  },
});
