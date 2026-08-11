import { PropsWithChildren, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';
import { fadeInEntering } from '@/shared/utils/motion-entering';

export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View>
      <Pressable
        style={({ pressed, focused }) => [
          styles.heading,
          { gap: spacing.xs },
          pressed && styles.pressedHeading,
          focusRingStyle(focused, colors.primary),
        ]}
        onPress={() => setIsOpen((value) => !value)}>
        <View
          style={[
            styles.button,
            {
              width: spacing.lg,
              height: spacing.lg,
              borderRadius: surfaceRadius.card,
              backgroundColor: colors.surfaceMuted,
            },
          ]}>
          <Text style={[typography.caption, { color: colors.text }]}>{isOpen ? '▼' : '▶'}</Text>
        </View>

        <Text style={[typography.caption, { color: colors.text }]}>{title}</Text>
      </Pressable>
      {isOpen ? (
        <Animated.View entering={fadeInEntering(reducedMotion)}>
          <View
            style={[
              styles.content,
              {
                marginTop: spacing.xs,
                padding: spacing.sm,
                borderRadius: surfaceRadius.card,
                backgroundColor: colors.surfaceMuted,
              },
            ]}>
            {children}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressedHeading: {
    opacity: 0.7,
  },
  button: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {},
});
