import React from 'react';
import Animated, { FadeIn, ZoomIn, ZoomOut } from 'react-native-reanimated';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { motion } from '@/theme/motion';

type Props = {
  visible: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Sheet content wrapper — fade + zoom 95% enter (web AlertDialog parity). */
export function AnimatedSheet({ visible, children, style }: Props) {
  const reducedMotion = useReducedMotion();

  if (!visible) return null;

  const entering = reducedMotion
    ? FadeIn.duration(0)
    : ZoomIn.duration(motion.modalEnter).springify().damping(18).stiffness(220);
  const exiting = reducedMotion ? undefined : ZoomOut.duration(motion.modalEnter);

  return (
    <Animated.View entering={entering} exiting={exiting} style={[styles.root, style]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
