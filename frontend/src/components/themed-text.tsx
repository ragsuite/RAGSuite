import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: 'text' | 'textMuted' | 'textSecondary' | 'background' | 'surface' | 'surfaceMuted' | 'primary';
};

const FONT_BY_TYPE = {
  default: 'sans',
  small: 'sans',
  link: 'sans',
  linkPrimary: 'sans',
  smallBold: 'sansBold',
  subtitle: 'sansSemiBold',
  title: 'display',
  code: 'mono',
} as const;

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const { colors, fonts } = useAppTheme();

  const resolvedColorKey = themeColor === 'textSecondary' ? 'textMuted' : (themeColor ?? 'text');
  const color =
    resolvedColorKey === 'text'
      ? colors.text
      : resolvedColorKey === 'textMuted'
        ? colors.textMuted
        : resolvedColorKey === 'background'
          ? colors.background
          : resolvedColorKey === 'surface'
            ? colors.surface
            : resolvedColorKey === 'surfaceMuted'
              ? colors.surfaceMuted
              : colors.primary;

  const fontFamily = fonts[FONT_BY_TYPE[type]];

  return (
    <Text
      style={[
        { color, fontFamily },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
  },
  code: {
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
