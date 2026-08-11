import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  rows?: number;
  compact?: boolean;
  variant?: 'card' | 'table';
  /** Tighter spacing when rendered directly under the mobile toolbar. */
  inset?: boolean;
};

export function AuditLogsSkeleton({ rows = 6, compact = false, variant = 'card', inset = false }: Props) {
  const { colors, spacing, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const rowGap = inset ? spacing.xxs : spacing.sm;

  if (variant === 'table') {
    return (
      <>
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={`audit-skeleton-table-${index}`}
            style={[
              styles.tableRow,
              {
                borderBottomColor: colors.border,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.sm,
                gap: spacing.xs,
              },
            ]}>
            <View style={[styles.line, { width: '18%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
            <View style={[styles.line, { width: '10%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
            <View style={[styles.line, { width: '8%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
            <View style={[styles.line, { width: '22%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
            <View style={[styles.line, { width: '16%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
            <View style={[styles.line, { width: '14%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
            <View style={[styles.line, { width: '8%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
          </View>
        ))}
      </>
    );
  }

  return (
    <View style={{ gap: rowGap }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={`audit-skeleton-${index}`}
          style={[
            styles.row,
            {
              borderColor: colors.border,
              borderRadius: panelRadius,
              backgroundColor: colors.surface,
              padding: spacing.sm,
              gap: spacing.xs,
            },
          ]}>
          <View style={[styles.line, { width: compact ? '55%' : '32%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
          <View style={[styles.line, { width: compact ? '88%' : '72%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
          <View style={[styles.line, { width: compact ? '70%' : '48%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
          {!compact ? (
            <View style={[styles.line, { width: '90%', backgroundColor: colors.surfaceMuted, borderRadius: controlRadius }]} />
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderWidth: 1,
  },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  line: {
    height: 12,
  },
});
