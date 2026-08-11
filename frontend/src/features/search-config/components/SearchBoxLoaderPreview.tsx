import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { SearchBoxLoader } from '@/features/search-config/types/search-config.types';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';

type Props = {
  loader: SearchBoxLoader;
  compact?: boolean;
};

const SKELETON_WIDTHS: Array<number | `${number}%`> = ['100%', '100%', '75%', '100%', '85%', '65%'];

export function SearchBoxLoaderPreview({ loader, compact = false }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(reducedMotion ? 0.7 : 0.45)).current;

  useEffect(() => {
    if (loader !== 'skeleton' || reducedMotion) {
      pulse.setValue(reducedMotion ? 0.7 : 1);
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
  }, [loader, pulse, reducedMotion]);

  const typingOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (loader !== 'typing' || reducedMotion) {
      typingOpacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(typingOpacity, { toValue: 0.35, duration: 500, useNativeDriver: true }),
        Animated.timing(typingOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loader, reducedMotion, typingOpacity]);

  if (loader === 'typing') {
    return (
      <Animated.Text
        style={[
          typography.body,
          {
            color: colors.textMuted,
            opacity: typingOpacity,
            paddingVertical: compact ? spacing.xs : spacing.sm,
          },
        ]}>
        ... AI is thinking...
      </Animated.Text>
    );
  }

  return (
    <View style={{ gap: spacing.sm, paddingVertical: compact ? spacing.xs : spacing.sm }}>
      {SKELETON_WIDTHS.map((width, index) => (
        <Animated.View
          key={`skeleton-bar-${index}`}
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
