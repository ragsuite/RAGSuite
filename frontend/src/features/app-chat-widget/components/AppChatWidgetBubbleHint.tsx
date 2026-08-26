import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text } from 'react-native';

import { motionDuration, useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  message: string;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  visible: boolean;
  onPress?: () => void;
};

export function AppChatWidgetBubbleHint({
  message,
  backgroundColor,
  textColor,
  borderColor,
  visible,
  onPress,
}: Props) {
  const { surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion && visible ? 1 : 0)).current;
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) setRendered(true);

    const animation = Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: motionDuration(reducedMotion, 300),
      useNativeDriver: Platform.OS !== 'web',
    });

    animation.start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });

    return () => {
      animation.stop();
    };
  }, [opacity, reducedMotion, visible]);

  if (!message.trim() || !rendered) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{ opacity, maxWidth: 300, marginBottom: 12 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={message}
        onPress={onPress}
        style={[
          styles.shell,
          {
            borderRadius: surfaceRadius.card,
            backgroundColor,
            borderColor,
          },
        ]}>
        <Text style={[styles.text, { color: textColor }]}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 15,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
});
