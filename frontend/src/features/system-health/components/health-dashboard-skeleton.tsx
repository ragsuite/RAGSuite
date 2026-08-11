import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';

import { systemHealthUi, toUiMode } from '@/features/system-health/system-health-ui.tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';

function SkeletonBlock({ style }: { style?: object }) {
  const { mode, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const ui = systemHealthUi(toUiMode(mode), { surfaceRadius });
  const opacity = useRef(new Animated.Value(reducedMotion ? 0.7 : 0.45)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.7);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return <Animated.View style={[{ backgroundColor: ui.mutedTrack, opacity }, style]} />;
}

export function HealthDashboardSkeleton() {
  const { spacing, surfaceRadius, mode } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const ui = systemHealthUi(toUiMode(mode), { surfaceRadius });
  const isWeb = Platform.OS === 'web';

  return (
    <View style={{ gap: spacing.sm }}>
      <SkeletonBlock style={{ height: 32, width: '38%', borderRadius: surfaceRadius.card }} />
      <SkeletonBlock style={{ height: 15, width: '48%', borderRadius: surfaceRadius.card }} />
      <SkeletonBlock style={{ height: 126, borderRadius: panelRadius }} />
      <SkeletonBlock style={{ height: 20, width: '28%', borderRadius: surfaceRadius.card }} />
      <View style={[styles.grid, { gap: spacing.sm }]}> 
        {[0, 1, 2, 3, 4].map((item) => (
          <SkeletonBlock
            key={item}
            style={{
              minWidth: isWeb ? 260 : '100%',
              flex: 1,
              height: 172,
              borderRadius: ui.geometry.sectionRadius,
            }}
          />
        ))}
      </View>
      <SkeletonBlock style={{ height: 92, borderRadius: surfaceRadius.card }} />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
