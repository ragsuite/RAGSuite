import { View, type ViewProps } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type ThemedViewProps = ViewProps & {
  type?: 'background' | 'surface' | 'surfaceMuted' | 'primaryTint';
};

export function ThemedView({ style, type, ...otherProps }: ThemedViewProps) {
  const { colors } = useAppTheme();

  const backgroundColor =
    type === 'surface'
      ? colors.surface
      : type === 'surfaceMuted'
        ? colors.surfaceMuted
        : type === 'primaryTint'
          ? colors.primaryTint
          : colors.background;

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
