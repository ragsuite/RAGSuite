import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { COLOR_SPECTRUM_GRADIENT, normalizeHex } from '@/shared/utils/color-picker';

type SwatchSize = number | { width: number; height: number };

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPress?: () => void;
  size?: SwatchSize;
  accessibilityLabel?: string;
};

function resolveSize(size: SwatchSize = 40) {
  if (typeof size === 'number') {
    return { width: size, height: size };
  }
  return size;
}

function SpectrumGradient({ borderRadius }: { borderRadius: number }) {
  return (
    <LinearGradient
      colors={[...COLOR_SPECTRUM_GRADIENT]}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={[StyleSheet.absoluteFill, { borderRadius }]}
      pointerEvents="none"
    />
  );
}

export function AppColorPickerTrigger({
  value,
  onChange,
  onPress,
  size = 40,
  accessibilityLabel,
}: Props) {
  const { colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const hex = normalizeHex(value);
  const dimensions = resolveSize(size);
  const borderRadius = surfaceRadius.button;
  const label = accessibilityLabel ?? t('common.color.openPicker');

  if (Platform.OS === 'web') {
    return (
      <View
        style={[
          styles.swatch,
          dimensions,
          {
            position: 'relative',
            overflow: 'hidden',
            borderColor: colors.border,
            borderRadius,
          },
        ]}>
        <SpectrumGradient borderRadius={borderRadius} />
        <input
          type="color"
          value={hex}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            padding: 0,
            margin: 0,
            border: 'none',
            cursor: 'pointer',
          }}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.swatch,
        dimensions,
        {
          overflow: 'hidden',
          borderColor: colors.border,
          borderRadius,
        },
      ]}>
      <SpectrumGradient borderRadius={borderRadius} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  swatch: {
    borderWidth: 1,
    flexShrink: 0,
  },
});
