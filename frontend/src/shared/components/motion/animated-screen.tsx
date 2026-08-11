import React from 'react';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { pageEntering } from '@/shared/utils/motion-entering';
import { motion } from '@/theme/motion';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Wraps screen content with web-parity page enter animation (bottom → top). */
export function AnimatedScreen({ children, style }: Props) {
  const reducedMotion = useReducedMotion();
  const entering = pageEntering(reducedMotion) ?? FadeInUp.duration(reducedMotion ? 0 : motion.pageEnter);

  return (
    <Animated.View entering={entering} style={[styles.root, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
