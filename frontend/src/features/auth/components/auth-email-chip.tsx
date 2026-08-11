import { Mail } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  email: string;
  label?: string;
};

export function AuthEmailChip({ email, label }: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();

  if (!email.trim()) return null;

  return (
    <View style={[styles.stack, { gap: spacing.xxs }]}>
      {label ? (
        <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>{label}</Text>
      ) : null}
      <View
        style={[
          styles.chip,
          {
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.sm,
            gap: spacing.xs,
          },
        ]}>
        <Mail size={16} color={colors.primary} />
        <Text style={[typography.body, styles.email, { color: colors.text }]} numberOfLines={1}>
          {email}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  email: {
    flex: 1,
  },
});
