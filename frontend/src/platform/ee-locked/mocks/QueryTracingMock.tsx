import React from 'react';
import { Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Decorative deep-query-tracing layout — fake labels only, no live spans/params. */
export function QueryTracingMock() {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const spans = [
    { label: 'retrieve', widthPct: 72 },
    { label: 'rerank', widthPct: 28 },
    { label: 'generate', widthPct: 88 },
    { label: 'cite', widthPct: 36 },
  ];
  const params = [
    ['temperature', '0.30'],
    ['top_k', '8'],
    ['similarity_threshold', '0.45'],
    ['max_tokens', '1000'],
    ['llm_model', '••••••••'],
  ];

  return (
    <View style={{ gap: spacing.md }}>
      <Text style={[typography.headingSemibold, { color: colors.text }]}>Timings</Text>
      <View style={{ gap: spacing.xs }}>
        {spans.map((span) => (
          <View key={span.label} style={{ gap: 4 }}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{span.label}</Text>
            <View
              style={{
                height: 10,
                borderRadius: surfaceRadius.button,
                backgroundColor: colors.surfaceMuted,
                overflow: 'hidden',
              }}>
              <View
                style={{
                  width: `${span.widthPct}%`,
                  height: '100%',
                  backgroundColor: colors.primaryTint,
                }}
              />
            </View>
          </View>
        ))}
      </View>

      <Text style={[typography.headingSemibold, { color: colors.text }]}>Parameters used</Text>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        }}>
        {params.map(([key, value]) => (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.xs,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              gap: spacing.sm,
            }}>
            <Text style={[typography.caption, { color: colors.textMuted, flex: 1, fontFamily: fonts.mono }]}>
              {key}
            </Text>
            <Text style={[typography.caption, { color: colors.textSoft, flex: 1, fontFamily: fonts.mono }]}>
              {value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
