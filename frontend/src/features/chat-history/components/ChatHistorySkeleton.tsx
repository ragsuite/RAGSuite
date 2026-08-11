import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  rows?: number;
};

export function ChatHistorySkeleton({ rows = 5 }: Props) {
  const { colors, spacing, surfaceRadius } = useAppTheme();

  return (
    <View style={{ gap: 0 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.row,
            {
              borderBottomColor: colors.border,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.md,
              gap: spacing.sm,
            },
          ]}>
          <View style={[styles.line, styles.title, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
          <View style={[styles.line, styles.preview, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
          <View style={[styles.line, styles.meta, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  line: {
    height: 12,
  },
  title: {
    width: '45%',
    height: 16,
  },
  preview: {
    width: '92%',
    height: 14,
  },
  meta: {
    width: '55%',
  },
});
