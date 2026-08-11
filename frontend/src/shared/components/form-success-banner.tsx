import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  message: string;
};

export function FormSuccessBanner({ message }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View
      style={[
        styles.base,
        {
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.primaryTint,
          padding: spacing.xs,
          borderWidth: 1,
          borderColor: colors.primary,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.success }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
  },
});
