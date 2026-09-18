import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';

const SKELETON_WIDTHS: Array<number | `${number}%`> = ['100%', '100%', '75%', '100%', '85%', '65%'];

/** AI Assistant–local skeleton wait state (mirrors Search skeleton look; does not edit Search). */
export function AiAssistantSkeletonLoader({ compact = false }: { compact?: boolean }) {
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(reducedMotion ? 0.7 : 0.45)).current;

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  return (
    <View style={{ gap: spacing.sm, paddingVertical: compact ? spacing.xs : spacing.sm }}>
      {SKELETON_WIDTHS.map((width, index) => (
        <Animated.View
          key={`ai-assistant-skeleton-${index}`}
          style={[
            styles.skeletonBar,
            {
              width,
              height: compact ? 12 : 16,
              borderRadius: surfaceRadius.card,
              backgroundColor: colors.surfaceMuted,
              opacity: pulse,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonBar: { alignSelf: 'flex-start' },
});
