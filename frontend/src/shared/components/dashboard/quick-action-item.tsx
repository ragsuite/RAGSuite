import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { hrefForAppRoute, type AppRouteName } from '@/config/navigation';
import { AppIcon } from '@/shared/components/app-icon';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  description: string;
  route: Exclude<AppRouteName, 'index' | 'onboarding' | 'sign-out'>;
};

export function QuickActionItem({ label, description, route }: Props) {
  const router = useRouter();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <Pressable
      onPress={() => router.push(hrefForAppRoute(route))}
      style={({ pressed, focused }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.surface : colors.surfaceMuted,
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.sm,
        },
        focusRingStyle(focused, colors.primary),
      ]}>
      <View style={[styles.copy, { gap: spacing.xxs }]}>
        <Text style={[typography.body, styles.label, { color: colors.text }]}>{label}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{description}</Text>
      </View>
      <AppIcon icon={ChevronRight} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  copy: {
    flex: 1,
    paddingRight: 10,
  },
  label: {
  },
});
