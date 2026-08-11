import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useProjectsLayout } from '@/features/projects/utils/projects-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  rows?: number;
};

export function ProjectsSkeleton({ rows = 3 }: Props) {
  const { colors, spacing, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const shellRadius = surfaceRadius.card;
  const { useCardLayout } = useProjectsLayout();

  if (useCardLayout) {
    return (
      <View style={{ gap: spacing.sm, width: '100%' }}>
        {Array.from({ length: rows }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.card,
              {
                borderColor: colors.border,
                borderRadius: shellRadius,
                backgroundColor: colors.surface,
                padding: spacing.sm,
                gap: spacing.sm,
              },
            ]}>
            <View style={styles.cardTop}>
              <View style={[styles.block, styles.icon, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
              <View style={{ flex: 1, gap: spacing.xs }}>
                <View style={[styles.block, styles.title, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
                <View style={[styles.block, styles.line, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
                <View style={[styles.block, styles.meta, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
              </View>
            </View>
            <View style={styles.cardActions}>
              <View style={[styles.block, styles.action, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
              <View style={[styles.block, styles.action, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
            </View>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.shell,
        {
          borderColor: colors.border,
          borderRadius: shellRadius,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        },
      ]}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.row,
            {
              borderBottomColor: colors.border,
              borderBottomWidth: index === rows - 1 ? 0 : StyleSheet.hairlineWidth,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              gap: spacing.sm,
            },
          ]}>
          <View style={[styles.block, styles.icon, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <View style={[styles.block, styles.title, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
            <View style={[styles.block, styles.line, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
            <View style={[styles.block, styles.meta, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
          </View>
          <View style={[styles.block, styles.action, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    width: '100%',
  },
  card: {
    borderWidth: 1,
    width: '100%',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  block: {
    opacity: 0.7,
  },
  icon: {
    width: 36,
    height: 36,
  },
  title: {
    width: '42%',
    height: 14,
  },
  line: {
    width: '68%',
    height: 12,
  },
  meta: {
    width: '36%',
    height: 10,
  },
  action: {
    width: 44,
    height: 44,
  },
});
