import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

import { colors } from '@/theme/colors';

export function buildNavigationTheme(mode: 'light' | 'dark'): Theme {
  const palette = colors[mode];
  const base = mode === 'dark' ? DarkTheme : DefaultTheme;

  return {
    ...base,
    dark: mode === 'dark',
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.surface,
      text: palette.text,
      border: palette.border,
      notification: palette.danger,
    },
  };
}
