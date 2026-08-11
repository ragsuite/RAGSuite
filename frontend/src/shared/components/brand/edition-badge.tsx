import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type EditionVariant = 'community' | 'enterprise' | 'beta';

const DEFAULT_LABELS: Record<EditionVariant, string> = {
  community: 'Community',
  enterprise: 'Enterprise',
  beta: 'Beta',
};

type Props = {
  variant: EditionVariant;
  label?: string;
};

/** CE / EE / Beta edition pills — AGENTS.md §5. Text always present; never colour alone. */
export function EditionBadge({ variant, label }: Props) {
  const { colors, spacing, typography, radius } = useAppTheme();
  const text = label ?? DEFAULT_LABELS[variant];

  const palette =
    variant === 'community'
      ? {
          color: colors.primaryPressed,
          backgroundColor: 'transparent',
          borderColor: colors.primaryPressed,
        }
      : variant === 'enterprise'
        ? {
            color: colors.textOnPrimary,
            backgroundColor: colors.primaryPressed,
            borderColor: colors.primaryPressed,
          }
        : {
            color: colors.ochre,
            backgroundColor: colors.ochreTint,
            borderColor: colors.ochre,
          };

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={text}
      style={[
        styles.badge,
        {
          borderRadius: radius.pill,
          paddingHorizontal: spacing.xs,
          paddingVertical: 2,
          borderColor: palette.borderColor,
          backgroundColor: palette.backgroundColor,
        },
      ]}>
      <Text style={[typography.eyebrow, styles.label, { color: palette.color, fontSize: 11, letterSpacing: 0.6 }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
  },
  label: {
    lineHeight: 16,
  },
});
