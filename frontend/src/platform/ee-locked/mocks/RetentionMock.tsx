import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative retention / compliance panel — fake controls only. */
export function RetentionMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.subtitle, { color: colors.text }]}>Data retention</Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          backgroundColor: colors.surface,
          gap: spacing.sm,
        }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Retention period (days)</Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: surfaceRadius.button,
            padding: spacing.sm,
            backgroundColor: colors.surfaceMuted,
            width: 120,
          }}>
          <Text style={[typography.body, { color: colors.textSoft }]}>90</Text>
        </View>
        <View
          style={{
            backgroundColor: colors.primaryTint,
            borderRadius: surfaceRadius.card,
            padding: spacing.md,
            gap: spacing.xs,
          }}>
          <Text style={[typography.caption, { color: colors.primary }]}>Policy</Text>
          <Text style={[typography.body, { color: colors.textSoft }]}>• Auto-delete after retention</Text>
          <Text style={[typography.body, { color: colors.textSoft }]}>• Legal hold override</Text>
          <Text style={[typography.body, { color: colors.textSoft }]}>• Compliance export</Text>
        </View>
      </View>
    </View>
  );
}
