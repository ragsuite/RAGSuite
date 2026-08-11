import React, { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type HintRowProps = {
  title?: string;
  hint?: ReactNode;
};

export function HintRow({ title = 'Try editing', hint = 'app/index.tsx' }: HintRowProps) {
  const { colors, spacing, surfaceRadius, typography, fonts } = useAppTheme();

  return (
    <View style={styles.stepRow}>
      <Text style={[typography.caption, { color: colors.text }]}>{title}</Text>
      <View
        style={[
          styles.codeSnippet,
          {
            borderRadius: surfaceRadius.card,
            paddingVertical: spacing.xxs,
            paddingHorizontal: spacing.xs,
            backgroundColor: colors.primaryTint,
          },
        ]}>
        <Text style={[typography.caption, { color: colors.textSoft, fontFamily: fonts.mono }]}>
          {hint}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  codeSnippet: {},
});
