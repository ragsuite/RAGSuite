import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Variant = 'main' | 'detail';

type Props = {
  variant?: Variant;
};

function SkeletonBlock({ height, width, radius: blockRadius }: { height: number; width: number | `${number}%`; radius: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[
        styles.block,
        { height, width, borderRadius: blockRadius, backgroundColor: colors.surfaceMuted },
      ]}
    />
  );
}

export function SearchConfigSkeleton({ variant = 'main' }: Props) {
  const { spacing, radius, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const { isCompact } = useSearchConfigLayout();

  if (variant === 'detail') {
    return (
      <View style={{ gap: spacing.md }}>
        <SkeletonBlock height={28} width="55%" radius={controlRadius} />
        <SkeletonBlock height={16} width="80%" radius={controlRadius} />
        <SkeletonBlock height={220} width="100%" radius={panelRadius} />
        <SkeletonBlock height={140} width="100%" radius={panelRadius} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <SkeletonBlock height={44} width="100%" radius={panelRadius} />
      <SkeletonBlock height={42} width="100%" radius={controlRadius} />
      <View style={{ gap: spacing.sm }}>
        <SkeletonBlock height={20} width="40%" radius={controlRadius} />
        <SkeletonBlock height={14} width="72%" radius={controlRadius} />
      </View>
      {isCompact ? (
        <View style={{ gap: spacing.xs }}>
          <SkeletonBlock height={52} width="100%" radius={controlRadius} />
          <SkeletonBlock height={52} width="100%" radius={controlRadius} />
          <SkeletonBlock height={52} width="100%" radius={controlRadius} />
        </View>
      ) : (
        <View style={[styles.split, { gap: spacing.lg }]}>
          <SkeletonBlock height={280} width="100%" radius={panelRadius} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <SkeletonBlock height={120} width="100%" radius={panelRadius} />
            <SkeletonBlock height={120} width="100%" radius={panelRadius} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { opacity: 0.65 },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
