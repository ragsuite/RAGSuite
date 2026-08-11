import type { ComponentType } from 'react';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthStepIcon } from '@/features/auth/components/auth-step-icon';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  title: string;
  subtitle?: string;
  helper?: string;
};

export function AuthFormHeader({ icon, title, subtitle, helper }: Props) {
  const { colors, spacing, typography } = useAppTheme();

  return (
    <View style={[styles.stack, { gap: spacing.xs, marginBottom: spacing.xxs }]}>
      <AuthStepIcon icon={icon} />
      <Text style={[typography.pageDisplay, styles.title, { color: colors.text, textAlign: 'center' }]}>{title}</Text>
      {subtitle ? (
        <Text style={[typography.body, styles.centered, { color: colors.textMuted }]}>{subtitle}</Text>
      ) : null}
      {helper ? (
        <Text style={[typography.caption, styles.centered, { color: colors.textMuted }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    alignItems: 'center',
    width: '100%',
  },
  title: {
    textAlign: 'center',
  },
  centered: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
