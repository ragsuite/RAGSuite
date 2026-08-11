import React from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  align?: 'left' | 'right' | 'center';
};

/** Mono uppercase table column header — AGENTS.md data table spec. */
export function TableHeaderLabel({ children, style, align = 'left' }: Props) {
  const { colors, typography } = useAppTheme();

  return (
    <Text
      style={[
        typography.eyebrow,
        styles.header,
        {
          color: colors.textSoft,
          textAlign: align,
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    fontSize: 11,
    letterSpacing: 0.66,
  },
});
