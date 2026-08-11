import React from 'react';
import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Variant = 'body' | 'metric';

type Props = TextProps & {
  variant?: Variant;
  style?: StyleProp<TextStyle>;
};

/** Tabular lining numerals — AGENTS.md rule for metrics, timestamps, and data. */
export function NumericText({ variant = 'body', style, children, ...rest }: Props) {
  const { typography } = useAppTheme();
  const numericStyle = variant === 'metric' ? typography.metric : typography.numeric;

  return (
    <Text {...rest} style={[numericStyle, style]}>
      {children}
    </Text>
  );
}
