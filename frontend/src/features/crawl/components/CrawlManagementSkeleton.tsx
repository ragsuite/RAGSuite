import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

function SkeletonBlock({
  height,
  width,
  radius: blockRadius,
}: {
  height: number;
  width: number | `${number}%`;
  radius: number;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.block,
        {
          height,
          width,
          borderRadius: blockRadius,
          backgroundColor: colors.surfaceMuted,
        },
      ]}
    />
  );
}

export function CrawlManagementSkeleton() {
  const { spacing, radius, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={[styles.row, { gap: spacing.xs }]}>
        <SkeletonBlock height={44} width="100%" radius={panelRadius} />
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <SkeletonBlock height={42} width="100%" radius={controlRadius} />
      </View>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <SkeletonBlock height={42} width={140} radius={controlRadius} />
        <SkeletonBlock height={42} width={140} radius={controlRadius} />
      </View>
      <SkeletonBlock height={28} width="35%" radius={controlRadius} />
      <View style={{ gap: spacing.xs }}>
        <SkeletonBlock height={52} width="100%" radius={controlRadius} />
        <SkeletonBlock height={88} width="100%" radius={panelRadius} />
        <SkeletonBlock height={88} width="100%" radius={panelRadius} />
        <SkeletonBlock height={88} width="100%" radius={panelRadius} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    opacity: 0.65,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
