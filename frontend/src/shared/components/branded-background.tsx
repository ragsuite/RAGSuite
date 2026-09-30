import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { BackgroundTheme } from '@/features/settings/types/settings.types';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getBrandedBackgroundStyle } from '@/shared/utils/branded-background-style';

export { getBrandedBackgroundStyle } from '@/shared/utils/branded-background-style';

type Props = {
  /** Override settings theme (e.g. Live Preview draft). */
  theme?: BackgroundTheme;
  /** Base fill color override (defaults to theme background). */
  backgroundColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** When true, fills parent via absolute positioning (pointerEvents none). */
  fill?: boolean;
};

/** Applies workspace background theme (geometric grid vs flat default). */
export function BrandedBackground({
  theme,
  backgroundColor,
  style,
  children,
  fill = false,
}: Props) {
  const { colors, backgroundTheme, mode } = useAppTheme();
  const resolvedTheme = theme ?? backgroundTheme;
  const baseColor = backgroundColor ?? colors.background;
  const brandedStyle = getBrandedBackgroundStyle({
    backgroundTheme: resolvedTheme,
    backgroundColor: baseColor,
    mode,
  });

  return (
    <View
      pointerEvents={fill ? 'none' : undefined}
      style={[fill ? StyleSheet.absoluteFillObject : null, brandedStyle, style]}>
      {resolvedTheme === 'geometric' && Platform.OS !== 'web' ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(46,106,78,0.04)',
            },
          ]}
        />
      ) : null}
      {children}
    </View>
  );
}
