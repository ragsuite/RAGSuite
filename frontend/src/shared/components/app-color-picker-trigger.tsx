import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useFieldWriteLock } from '@/features/organization/hooks/use-module-write';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webLockedCursor } from '@/shared/utils/web-locked-cursor';
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
  const locked = useFieldWriteLock();
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
            opacity: locked ? 0.72 : 1,
          },
          webLockedCursor(locked),
        ]}>
        <SpectrumGradient borderRadius={borderRadius} />
        <input
          type="color"
          value={hex}
          aria-label={label}
          disabled={locked}
          onChange={(event) => {
            if (locked) return;
            onChange(event.target.value);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            padding: 0,
            margin: 0,
            border: 'none',
            cursor: locked ? 'not-allowed' : 'pointer',
            pointerEvents: locked ? 'none' : 'auto',
          }}
        />
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: locked }}
      disabled={locked}
      onPress={locked ? undefined : onPress}
      style={[
        styles.swatch,
        dimensions,
        {
          overflow: 'hidden',
          borderColor: colors.border,
          borderRadius,
          opacity: locked ? 0.72 : 1,
        },
        webLockedCursor(locked),
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
