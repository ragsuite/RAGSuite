import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRIMARY_COLOR_OPTIONS } from '@/features/settings/services/settings.service';
import type { ThemeOption, ThemeMode } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  options: ThemeOption[];
  value: ThemeMode;
  primaryColor: string;
  fontScale: number;
  onThemeChange: (theme: ThemeMode) => void;
  onPrimaryColorChange: (primaryColor: string) => void;
  onFontScaleChange: (fontScale: number) => void;
};

const FONT_SCALES = [0.9, 1, 1.1, 1.2] as const;

export function ThemeSelector({
  options,
  value,
  primaryColor,
  fontScale,
  onThemeChange,
  onPrimaryColorChange,
  onFontScaleChange,
}: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { gap: spacing.md }]}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onThemeChange(option.value)}
              style={[
                styles.optionCard,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.surfaceMuted : colors.surface,
                  borderRadius: surfaceRadius.card,
                  padding: spacing.sm,
                },
              ]}>
              <Text style={[typography.body, styles.optionLabel, { color: colors.text }]}>{option.label}</Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{option.description}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.section, { gap: spacing.xs }]}>
        <Text style={[typography.body, styles.sectionTitle, { color: colors.text }]}>{t('settings.branding.primaryColor')}</Text>
        <View style={[styles.swatches, { gap: spacing.xs }]}>
          {PRIMARY_COLOR_OPTIONS.map((swatch) => (
            <Pressable
              key={swatch}
              onPress={() => onPrimaryColorChange(swatch)}
              style={[
                styles.swatch,
                {
                  backgroundColor: swatch,
                  borderRadius: surfaceRadius.button,
                  borderColor: swatch === primaryColor ? colors.text : colors.border,
                },
              ]}
            />
          ))}
        </View>
      </View>

      <View style={[styles.section, { gap: spacing.xs }]}>
        <Text style={[typography.body, styles.sectionTitle, { color: colors.text }]}>{t('settings.theme.fontScale')}</Text>
        <View style={[styles.row, { gap: spacing.xs }]}>
          {FONT_SCALES.map((valueOption) => (
            <Pressable
              key={valueOption}
              onPress={() => onFontScaleChange(valueOption)}
              style={[
                styles.scaleChip,
                {
                  borderColor: fontScale === valueOption ? colors.primary : colors.border,
                  borderRadius: surfaceRadius.button,
                  backgroundColor: fontScale === valueOption ? colors.surfaceMuted : colors.surface,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.text }]}>{Math.round(valueOption * 100)}%</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  optionCard: {
    borderWidth: 1,
    flex: 1,
    minWidth: 150,
    gap: 6,
  },
  optionLabel: {
  },
  section: {
    width: '100%',
  },
  sectionTitle: {
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  swatch: {
    width: 28,
    height: 28,
    borderWidth: 2,
  },
  scaleChip: {
    borderWidth: 1,
    minWidth: 64,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
