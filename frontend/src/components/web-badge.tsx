import { version } from 'expo/package.json';
import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function WebBadge() {
  const { mode, colors, spacing, typography } = useAppTheme();

  return (
    <View style={[styles.container, { padding: spacing.lg, gap: spacing.xs }]}>
      <Text style={[typography.caption, typography.numeric, { color: colors.textMuted, textAlign: 'center' }]}>
        v{version}
      </Text>
      <Image
        source={
          mode === 'dark'
            ? require('@/assets/images/expo-badge-white.png')
            : require('@/assets/images/expo-badge.png')
        }
        style={styles.badgeImage}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  badgeImage: {
    width: 123,
    aspectRatio: 123 / 24,
  },
});
