import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type MockRow = {
  name: string;
  on: boolean;
  days: number;
  lines: string[];
};

const MOCK_ROWS: MockRow[] = [
  {
    name: 'Support Assistant',
    on: true,
    days: 90,
    lines: ['Deletes history older than 90 days · 142 items due now', 'Oldest history deleted in 12 days · next purge within 24 hours'],
  },
  {
    name: 'Docs Search',
    on: false,
    days: 90,
    lines: ['Auto-delete off · history is kept without a limit'],
  },
  {
    name: 'Sales Chatbot',
    on: true,
    days: 30,
    lines: ['Deletes history older than 30 days · 0 items due now', 'Oldest history deleted in 4 days · next purge within 24 hours'],
  },
];

/** Decorative per-project retention list — fake projects and figures only. */
export function RetentionMock() {
  const { colors, spacing, typography, surfaceRadius, radius } = useAppTheme();

  return (
    <View style={{ gap: spacing.md }}>
      {MOCK_ROWS.map((row) => (
        <View
          key={row.name}
          style={[
            styles.card,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              backgroundColor: colors.surface,
              padding: spacing.md,
              gap: spacing.sm,
            },
          ]}>
          <View style={styles.header}>
            <Text style={[typography.subtitle, { color: colors.text }]}>{row.name}</Text>
            <View style={[styles.header, { gap: spacing.sm }]}>
              <Text style={[typography.caption, { color: colors.textSoft }]}>Enable auto-delete</Text>
              <View
                style={[
                  styles.track,
                  {
                    borderRadius: radius.pill,
                    backgroundColor: row.on ? colors.primary : colors.border,
                    alignItems: row.on ? 'flex-end' : 'flex-start',
                  },
                ]}>
                <View style={[styles.thumb, { borderRadius: radius.pill, backgroundColor: colors.surface }]} />
              </View>
            </View>
          </View>
          <View style={[styles.body, { gap: spacing.md }]}>
            {row.on ? (
              <View
                style={[
                  styles.field,
                  {
                    borderColor: colors.borderStrong,
                    borderRadius: surfaceRadius.button,
                    padding: spacing.sm,
                    backgroundColor: colors.surfaceMuted,
                  },
                ]}>
                <Text style={[typography.body, { color: colors.textSoft }]}>{row.days} days</Text>
              </View>
            ) : null}
            <View style={{ gap: spacing.xxs }}>
              {row.lines.map((line) => (
                <Text key={line} style={[typography.caption, { color: colors.textMuted }]}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  field: { borderWidth: 1, width: 120 },
  track: { width: 36, height: 20, padding: 2, justifyContent: 'center' },
  thumb: { width: 16, height: 16 },
});
