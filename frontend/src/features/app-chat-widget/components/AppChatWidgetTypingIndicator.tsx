import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';

type Props = {
  color: string;
};

export function AppChatWidgetTypingIndicator({ color }: Props) {
  const reducedMotion = useReducedMotion();
  const dot1 = useRef(new Animated.Value(reducedMotion ? 1 : 0.3)).current;
  const dot2 = useRef(new Animated.Value(reducedMotion ? 1 : 0.3)).current;
  const dot3 = useRef(new Animated.Value(reducedMotion ? 1 : 0.3)).current;

  useEffect(() => {
    if (reducedMotion) {
      dot1.setValue(1);
      dot2.setValue(1);
      dot3.setValue(1);
      return;
    }

    const animate = (value: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(value, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.3, duration: 320, useNativeDriver: true }),
        ]),
      );

    const animations = [animate(dot1, 0), animate(dot2, 120), animate(dot3, 240)];
    animations.forEach((animation) => animation.start());
    return () => animations.forEach((animation) => animation.stop());
  }, [dot1, dot2, dot3, reducedMotion]);

  return (
    <View style={styles.row}>
      {[dot1, dot2, dot3].map((opacity, index) => (
        <Animated.View
          key={index}
          style={[styles.dot, { backgroundColor: color, opacity }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
});
