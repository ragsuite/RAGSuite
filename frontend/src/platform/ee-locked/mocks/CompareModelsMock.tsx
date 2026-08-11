import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative compare-models layout — fake labels only. */
export function CompareModelsMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const models = ['Model A', 'Model B', 'Model C'];

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.pageDisplay, { color: colors.text }]}>Compare models</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {models.map((m) => (
          <View
            key={m}
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xxs,
              backgroundColor: colors.primaryTint,
            }}>
            <Text style={[typography.caption, { color: colors.primary }]}>{m}</Text>
          </View>
        ))}
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          backgroundColor: colors.surface,
          gap: spacing.sm,
        }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>Saved configurations</Text>
        <Text style={[typography.body, { color: colors.textSoft }]}>Baseline · Retrieval A · Retrieval B</Text>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          backgroundColor: colors.surface,
          flexDirection: 'row',
          gap: spacing.sm,
          alignItems: 'center',
        }}>
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, { color: colors.textMuted }]}>Query</Text>
          <Text style={[typography.body, { color: colors.textSoft }]}>How does our product handle…</Text>
        </View>
        <View
          style={{
            backgroundColor: colors.primary,
            borderRadius: surfaceRadius.button,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          }}>
          <Text style={[typography.body, { color: colors.textOnPrimary, fontWeight: '500' }]}>Compare</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {models.map((m) => (
          <View
            key={`result-${m}`}
            style={{
              flexGrow: 1,
              flexBasis: '28%',
              minWidth: 160,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              padding: spacing.md,
              backgroundColor: colors.surface,
              gap: spacing.xs,
              minHeight: 140,
            }}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{m}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>Score · Latency · Citations</Text>
            <Text style={[typography.body, { color: colors.textSoft }]}>
              Sample answer preview for side-by-side evaluation…
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
