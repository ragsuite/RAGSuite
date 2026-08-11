import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  rows?: number;
};

export function FeedbackSkeleton({ rows = 3 }: Props) {
  const { colors, spacing, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;

  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, index) => (
        <View
          key={index}
          style={[
            styles.row,
            {
              borderColor: colors.border,
              borderRadius: panelRadius,
              backgroundColor: colors.surfaceMuted,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 120,
    borderWidth: 1,
  },
});
