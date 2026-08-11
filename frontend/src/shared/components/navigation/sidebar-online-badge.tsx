import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { usePlatformOnlineStatus } from '@/features/system-health/hooks/usePlatformOnlineStatus';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function SidebarOnlineBadge() {
  const { t } = useTranslation();
  const { colors, spacing, typography, fonts, radius } = useAppTheme();
  const { status } = usePlatformOnlineStatus();
  const pulse = useRef(new Animated.Value(1)).current;

  const isOnline = status === 'online';
  const isChecking = status === 'checking';
  const label = isChecking
    ? t('sidebar.status.checking')
    : isOnline
      ? t('sidebar.status.online')
      : t('sidebar.status.offline');

  const dotColor = isChecking ? colors.textMuted : isOnline ? colors.success : colors.danger;
  const textColor = isChecking ? colors.textMuted : isOnline ? colors.primaryPressed : colors.danger;

  useEffect(() => {
    if (!isOnline) {
      pulse.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();
    return () => animation.stop();
  }, [isOnline, pulse]);

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          borderRadius: radius.pill,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          gap: 6,
        },
      ]}>
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: dotColor,
            opacity: isOnline ? pulse : 1,
          },
        ]}
      />
      <Text
        style={[
          typography.caption,
          styles.label,
          {
            color: textColor,
            fontFamily: fonts.mono,
          },
        ]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 0.2,
    textTransform: 'lowercase',
  },
});
