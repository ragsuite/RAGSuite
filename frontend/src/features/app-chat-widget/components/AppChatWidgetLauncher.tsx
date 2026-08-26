import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';

import { WidgetAvatarBubble } from '@/features/app-chat-widget/utils/app-chat-widget-display';
import { getAppChatWidgetLauncherSize } from '@/features/app-chat-widget/utils/app-chat-widget-layout';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  resolveSolidWidgetAccentColor,
  suggestTextColorForBackground,
} from '@/features/chatbot-config/utils/widget-theme-utils';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { brandTokens } from '@/theme/brand-tokens';
import { motion } from '@/theme/motion';

type Props = {
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  loading?: boolean;
  isOpen?: boolean;
  onPress: () => void;
};

export function AppChatWidgetLauncher({
  config,
  customization,
  loading,
  isOpen = false,
  onPress,
}: Props) {
  const launcherSize = getAppChatWidgetLauncherSize(customization.avatarSize);
  const accent = resolveSolidWidgetAccentColor(customization.primaryColor);
  const closeIconColor = suggestTextColorForBackground(accent);
  const reducedMotion = useReducedMotion();
  // Always start at 0 so remount-while-open (Host/Embed handoff) still morphs avatar → X.
  const openProgress = useSharedValue(0);

  useEffect(() => {
    openProgress.value = withTiming(isOpen ? 1 : 0, {
      duration: reducedMotion ? 0 : isOpen ? motion.chatPanelEnter : motion.chatPanelExit,
      easing: Easing.out(Easing.cubic),
    });
  }, [isOpen, openProgress, reducedMotion]);

  const avatarStyle = useAnimatedStyle(() => ({
    opacity: 1 - openProgress.value,
    transform: [{ rotate: `${openProgress.value * 90}deg` }],
  }));

  const closeStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
    transform: [{ rotate: `${(1 - openProgress.value) * -90}deg` }],
  }));

  // Fill follows morph progress — avoids transparent snap (white blink) on close.
  const fillStyle = useAnimatedStyle(() => ({
    opacity: openProgress.value,
  }));

  const closedChromeStyle = useAnimatedStyle(() => ({
    opacity: customization.shadow ? 1 - openProgress.value : 0,
  }));

  if (!config.showLauncher) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        isOpen
          ? 'Close chat'
          : config.launcherLabel || config.bubbleMessage || 'Open chat'
      }
      accessibilityState={{ expanded: isOpen }}
      onPress={onPress}
      // Neutral press feedback — no web/default white flash on open or close.
      android_ripple={{ color: 'transparent', borderless: true, foreground: false }}
      style={[
        styles.launcher,
        {
          width: launcherSize,
          height: launcherSize,
          borderRadius: launcherSize / 2,
          backgroundColor: 'transparent',
        },
      ]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          {
            width: launcherSize,
            height: launcherSize,
            borderRadius: launcherSize / 2,
            backgroundColor: accent,
          },
          fillStyle,
        ]}
      />
      {customization.shadow ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fill,
            {
              width: launcherSize,
              height: launcherSize,
              borderRadius: launcherSize / 2,
              borderWidth: 1,
              borderColor: brandTokens.color.hairlineStrong,
              backgroundColor: 'transparent',
            },
            closedChromeStyle,
          ]}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={isOpen ? closeIconColor : customization.primaryColor} />
      ) : (
        <View style={[styles.stack, { width: launcherSize, height: launcherSize }]}>
          <Animated.View style={[styles.layer, avatarStyle]} pointerEvents="none">
            <WidgetAvatarBubble
              avatarId={customization.avatarId}
              avatarUrl={customization.avatarUrl}
              size={launcherSize}
              color={customization.primaryColor}
            />
          </Animated.View>
          <Animated.View style={[styles.layer, styles.closeLayer]} pointerEvents="none">
            <Animated.View style={closeStyle}>
              <X
                size={Math.max(16, Math.round(launcherSize * 0.42))}
                color={closeIconColor}
                strokeWidth={2.25}
              />
            </Animated.View>
          </Animated.View>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  launcher: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeLayer: {
    zIndex: 1,
  },
});
