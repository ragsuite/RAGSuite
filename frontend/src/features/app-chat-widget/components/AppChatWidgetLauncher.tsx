import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';

import { WidgetAvatarBubble } from '@/features/app-chat-widget/utils/app-chat-widget-display';
import { getAppChatWidgetLauncherSize } from '@/features/app-chat-widget/utils/app-chat-widget-layout';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { brandTokens } from '@/theme/brand-tokens';

type Props = {
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  loading?: boolean;
  onPress: () => void;
};

export function AppChatWidgetLauncher({ config, customization, loading, onPress }: Props) {
  if (!config.showLauncher) return null;

  const launcherSize = getAppChatWidgetLauncherSize(customization.avatarSize);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={config.launcherLabel || config.bubbleMessage || 'Open chat'}
      accessibilityState={{ expanded: false }}
      onPress={onPress}
      style={({ pressed, hovered }) => {
        const isHovered = Boolean(hovered);
        const scale = pressed ? 0.92 : isHovered ? 1.04 : 1;
        return [
          styles.launcher,
          {
            width: launcherSize,
            height: launcherSize,
            borderRadius: launcherSize / 2,
            opacity: pressed ? 0.94 : 1,
            transform: [{ scale }],
            ...(customization.shadow
              ? {
                  borderWidth: 1,
                  borderColor: brandTokens.color.hairlineStrong,
                }
              : null),
          },
        ];
      }}>
      {loading ? (
        <ActivityIndicator color={customization.primaryColor} />
      ) : (
        <WidgetAvatarBubble
          avatarId={customization.avatarId}
          avatarUrl={customization.avatarUrl}
          size={launcherSize}
          color={customization.primaryColor}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  launcher: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
});
