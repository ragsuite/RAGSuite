import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { LocaleFlag } from '@/i18n/locale-flag';
import { useTranslation } from '@/i18n';
import { AdaptivePickerSheet } from '@/shared/components/adaptive/adaptive-picker-sheet';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  size?: number;
  borderRadius?: number;
  compact?: boolean;
};

function hexToRgba(hex: string, alpha: number) {
  const parsed = hex.replace('#', '');
  if (parsed.length !== 6) return hex;
  const r = Number.parseInt(parsed.slice(0, 2), 16);
  const g = Number.parseInt(parsed.slice(2, 4), 16);
  const b = Number.parseInt(parsed.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function LanguageSelector({ size = 34, borderRadius, compact }: Props) {
  const { locale, setLocale, availableLocales, t } = useTranslation();
  const { colors, typography, mode, surfaceRadius } = useAppTheme();
  const resolvedRadius = borderRadius ?? surfaceRadius.button;
  const [open, setOpen] = useState(false);
  const isDark = mode === 'dark';
  const isCompact = compact ?? Platform.OS !== 'web';

  const currentLocale = useMemo(
    () => availableLocales.find((item) => item.code === locale),
    [availableLocales, locale],
  );

  const options = useMemo(
    () =>
      availableLocales.map((item) => ({
        key: item.code,
        label: item.name,
        leading: <LocaleFlag code={item.code} size={20} />,
      })),
    [availableLocales],
  );

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('settings.i18n.defaultLanguage')}
        testID="button-language-selector"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.button,
          {
            minWidth: isCompact ? size : undefined,
            height: size,
            borderRadius: resolvedRadius,
            paddingHorizontal: isCompact ? 6 : 10,
            borderColor: isDark ? colors.border : hexToRgba(colors.primary, 0.2),
            backgroundColor: pressed
              ? isDark
                ? colors.sidebarAccent
                : colors.primaryTint
              : isDark
                ? colors.surfaceMuted
                : hexToRgba(colors.primary, 0.07),
            transform: [{ scale: pressed ? 0.98 : 1 }],
          },
        ]}>
        <LocaleFlag code={locale} size={20} />
        {!isCompact ? (
          <Text style={[typography.buttonLabel, { color: colors.text }]} numberOfLines={1}>
            {currentLocale?.name}
          </Text>
        ) : null}
      </Pressable>

      <AdaptivePickerSheet
        visible={open}
        title={t('settings.i18n.defaultLanguage')}
        value={locale}
        options={options}
        indicatorPosition="left"
        onSelect={(value) => setLocale(value)}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
  },
});
