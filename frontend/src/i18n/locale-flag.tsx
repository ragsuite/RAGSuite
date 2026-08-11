import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';

import { FlagByCountryCode } from '@/i18n/locale-flag-icons';
import { AVAILABLE_LOCALES, type AppLocaleCode } from '@/i18n/constants';

type Props = {
  code: AppLocaleCode | string;
  size?: number;
};

export function getLocaleMeta(code: string) {
  return AVAILABLE_LOCALES.find((locale) => locale.code === code);
}

/** SVG flags on native; emoji on web where font rendering is reliable. */
export function LocaleFlag({ code, size = 20 }: Props) {
  const locale = getLocaleMeta(code);
  if (!locale) return null;

  if (Platform.OS === 'web') {
    return (
      <Text allowFontScaling={false} style={[styles.emoji, { fontSize: size, lineHeight: size + 2 }]}>
        {locale.flag}
      </Text>
    );
  }

  return <FlagByCountryCode code={locale.countryCode} size={size} />;
}

const styles = StyleSheet.create({
  emoji: {
    textAlign: 'center',
  },
});
