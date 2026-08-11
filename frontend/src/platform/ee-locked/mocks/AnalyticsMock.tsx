import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

const POPULAR_QUERIES_MAX_HEIGHT = 180;
const POPULAR_QUERY_ROWS = [
  'Sample query alpha',
  'Sample query beta',
  'Sample query gamma',
  'Sample query delta',
  'Sample query epsilon',
];

/** Decorative analytics layout — fake labels only, no API data. */
export function AnalyticsMock() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  const kpi = ['Queries', 'Latency', 'Satisfaction', 'Tokens'];
  const charts = ['Daily queries', 'Latency p50/p95', 'Satisfaction', 'Source coverage'];

  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[typography.pageDisplay, { color: colors.text }]}>Analytics</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs }}>
          <MockChip label="Last 30 days" />
          <MockChip label="Export" />
        </View>
      </View>

      <View style={styles.kpiRow}>
        {kpi.map((label) => (
          <View
            key={label}
            style={[
              styles.kpi,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: surfaceRadius.card,
                padding: spacing.md,
              },
            ]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
            <Text style={[typography.metric, { color: colors.text, fontVariant: ['tabular-nums'] }]}>──</Text>
          </View>
        ))}
      </View>

      <View style={styles.chartGrid}>
        {charts.map((label) => (
          <View
            key={label}
            style={[
              styles.chart,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: surfaceRadius.card,
                padding: spacing.md,
                minHeight: 120,
              },
            ]}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
            <View style={[styles.chartBars, { gap: spacing.xs, marginTop: spacing.sm }]}>
              {[40, 65, 35, 80, 55, 70].map((h, i) => (
                <View
                  key={`${label}-${i}`}
                  style={{
                    flex: 1,
                    height: h,
                    backgroundColor: colors.primaryTint,
                    borderRadius: surfaceRadius.button,
                  }}
                />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {['Popular queries', 'Hard queries'].map((title) => (
          <View
            key={title}
            style={[
              styles.listCard,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: surfaceRadius.card,
                padding: spacing.md,
                flex: 1,
                gap: spacing.xs,
              },
            ]}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{title}</Text>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.listScroll}>
              {POPULAR_QUERY_ROWS.map((row) => (
                <Text key={`${title}-${row}`} style={[typography.caption, { color: colors.textMuted }]}>
                  {row}
                </Text>
              ))}
            </ScrollView>
          </View>
        ))}
      </View>
    </View>
  );
}

function MockChip({ label }: { label: string }) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: surfaceRadius.button,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xxs,
        backgroundColor: colors.surfaceMuted,
      }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  kpi: {
    borderWidth: 1,
    minWidth: 120,
    flexGrow: 1,
    flexBasis: '20%',
  },
  chartGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chart: {
    borderWidth: 1,
    flexGrow: 1,
    flexBasis: '40%',
  },
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
  },
  listCard: {
    borderWidth: 1,
  },
  listScroll: {
    maxHeight: POPULAR_QUERIES_MAX_HEIGHT,
  },
});
