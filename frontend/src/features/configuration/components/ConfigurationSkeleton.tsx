import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useConfigurationLayout } from '@/features/configuration/utils/configuration-layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  rows?: number;
};

function SkeletonBar({ width, height }: { width: number | `${number}%`; height: number }) {
  const { colors, surfaceRadius } = useAppTheme();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: surfaceRadius.card,
        backgroundColor: colors.surfaceMuted,
      }}
    />
  );
}

export function ConfigurationSkeleton({ rows = 3 }: Props) {
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const { useTableLayout } = useConfigurationLayout();

  if (useTableLayout) {
    return (
      <View
        style={[
          styles.tableShell,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surface,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}>
        <SkeletonBar width="100%" height={40} />
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonBar key={index} width="100%" height={52} />
        ))}
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
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
          <SkeletonBar width="40%" height={18} />
          <SkeletonBar width="70%" height={14} />
          <SkeletonBar width="55%" height={14} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tableShell: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  card: {
    borderWidth: 1,
  },
});
