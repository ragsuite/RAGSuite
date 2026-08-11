import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  title: string;
  description: string;
};

export function ScreenContainer({ title, description }: Props) {
  const { colors, spacing, typography } = useAppTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.lg, gap: spacing.xs }]}>
      <Text style={[typography.pageDisplay, { color: colors.text }]}>{title}</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
