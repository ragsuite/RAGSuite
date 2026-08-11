import type { TextStyle } from 'react-native';

type ThemeColors = { textMuted: string };
type ThemeTypography = { fieldInput: TextStyle; body: TextStyle };

export function getFieldPlaceholderColor(colors: ThemeColors) {
  return colors.textMuted;
}

export function getFieldPlaceholderTextStyle(typography: ThemeTypography, colors: ThemeColors): TextStyle {
  return {
    fontSize: typography.fieldInput.fontSize ?? typography.body.fontSize,
    fontWeight: '400',
    lineHeight: typography.fieldInput.lineHeight,
    color: colors.textMuted,
  };
}
