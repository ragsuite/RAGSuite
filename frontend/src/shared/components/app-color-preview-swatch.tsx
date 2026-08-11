import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { normalizeHex } from '@/shared/utils/color-picker';

type SwatchSize = number | { width: number; height: number };

type Props = {
  value: string;
  size?: SwatchSize;
};

function resolveSize(size: SwatchSize = 40) {
  if (typeof size === 'number') {
    return { width: size, height: size };
  }
  return size;
}

export function AppColorPreviewSwatch({ value, size = 40 }: Props) {
  const { colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const hex = normalizeHex(value);
  const dimensions = resolveSize(size);

  return (
    <View
      accessibilityLabel={t('common.color.selected', { color: hex })}
      accessibilityRole="image"
      importantForAccessibility="yes"
      pointerEvents="none"
      style={[
        styles.swatch,
        dimensions,
        {
          backgroundColor: hex,
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  swatch: {
    borderWidth: 1,
    flexShrink: 0,
  },
});
