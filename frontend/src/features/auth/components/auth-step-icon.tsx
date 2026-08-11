import type { ComponentType } from 'react';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { platformShadow } from '@/shared/utils/platform-shadow';

type Props = {
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

export function AuthStepIcon({ icon: Icon }: Props) {
  const { colors, surfaceRadius } = useAppTheme();

  return (
    <View
      style={[
        styles.wrap,
        platformShadow(
          {
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 8,
            elevation: 3,
          },
          { boxShadow: `0 4px 8px ${colors.primary}2E` },
        ),
        {
          backgroundColor: colors.primary,
          borderRadius: surfaceRadius.button,
        },
      ]}>
      <Icon size={22} color={colors.textOnPrimary} strokeWidth={2.25} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 48,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
});
