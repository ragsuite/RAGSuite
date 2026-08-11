import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
} & Pick<TextProps, 'accessibilityRole'>;

/** Mono uppercase nav / settings group label — AGENTS.md eyebrow spec. */
export function NavGroupLabel({ children, style, accessibilityRole }: Props) {
  const { colors, typography } = useAppTheme();

  return (
    <Text
      accessibilityRole={accessibilityRole}
      style={[typography.eyebrow, styles.label, { color: colors.textSoft }, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    letterSpacing: 0.66,
  },
});
