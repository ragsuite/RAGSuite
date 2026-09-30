import { Platform, type ViewStyle } from 'react-native';

import type { BackgroundTheme } from '@/features/settings/types/settings.types';

type BrandedBackgroundStyleParams = {
  backgroundTheme: BackgroundTheme;
  backgroundColor: string;
  mode: 'light' | 'dark';
};

/** Flat or subtle geometric grid over the base page background. */
export function getBrandedBackgroundStyle({
  backgroundTheme,
  backgroundColor,
  mode,
}: BrandedBackgroundStyleParams): ViewStyle {
  if (backgroundTheme !== 'geometric') {
    return { backgroundColor };
  }

  const line = mode === 'dark' ? 'rgba(255, 255, 255, 0.045)' : 'rgba(27, 26, 23, 0.045)';

  if (Platform.OS === 'web') {
    return {
      backgroundColor,
      ...( {
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
      } as ViewStyle),
    };
  }

  return { backgroundColor };
}
