import React from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { motion } from '@/theme/motion';

type Props = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Pressable with web `active:scale-95` feedback. */
export function AnimatedPressable({ children, style, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      style={({ pressed, ...state }) => {
        const base = typeof style === 'function' ? style({ pressed, ...state }) : style;
        return [base, pressed ? { transform: [{ scale: motion.pressScale }] } : null];
      }}>
      {children}
    </Pressable>
  );
}
