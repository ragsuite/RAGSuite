import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  message: string;
};

export function FormErrorBanner({ message }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  return (
    <View
      style={[
        styles.base,
        {
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.dangerBackground,
          padding: spacing.xs,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.danger }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
  },
});
