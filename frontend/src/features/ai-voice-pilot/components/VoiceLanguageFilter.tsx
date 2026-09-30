import React, { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Globe, X } from 'lucide-react-native';

import { AVAILABLE_LOCALES, type AppLocaleCode } from '@/i18n/constants';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { VoiceLanguageFilter } from '@/features/ai-voice-pilot/utils/voice-trending';

type Props = {
  value: VoiceLanguageFilter;
  onChange: (next: VoiceLanguageFilter) => void;
};

export function VoiceLanguageFilter({ value, onChange }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (value === 'all') return t('voicePilot.voices.filter.all');
    const locale = AVAILABLE_LOCALES.find((item) => item.code === value);
    return locale ? `${locale.flag} ${locale.name}` : value;
  }, [t, value]);

  const options: { key: VoiceLanguageFilter; label: string }[] = [
    { key: 'all', label: t('voicePilot.voices.filter.all') },
    ...AVAILABLE_LOCALES.map((locale) => ({
      key: locale.code as AppLocaleCode,
      label: `${locale.flag} ${locale.name}`,
    })),
  ];

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>
        {t('voicePilot.voices.filter.label')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('voicePilot.voices.filter.a11y')}
        onPress={() => setOpen(true)}
        style={({ pressed, hovered }) => [
          styles.trigger,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.button,
            backgroundColor: pressed || hovered ? colors.surfaceMuted : colors.surface,
            paddingHorizontal: spacing.sm,
            gap: spacing.xs,
          },
        ]}>
        <Globe size={16} color={colors.primary} />
        <Text style={[typography.body, { color: colors.text, flex: 1 }]}>{label}</Text>
        <ChevronDown size={16} color={colors.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: surfaceRadius.card,
                padding: spacing.md,
                maxHeight: Platform.OS === 'web' ? 420 : '70%',
              },
            ]}>
            <View style={[styles.sheetHeader, { marginBottom: spacing.sm }]}>
              <Text style={[typography.subtitle, { color: colors.text }]}>
                {t('voicePilot.voices.filter.title')}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
                onPress={() => setOpen(false)}
                hitSlop={8}>
                <X size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {options.map((option) => {
                const selected = value === option.key;
                return (
                  <Pressable
                    key={String(option.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      onChange(option.key);
                      setOpen(false);
                    }}
                    style={({ pressed, hovered }) => [
                      styles.option,
                      {
                        borderRadius: surfaceRadius.button,
                        backgroundColor: selected
                          ? colors.surfaceMuted
                          : pressed || hovered
                            ? colors.surfaceHover
                            : 'transparent',
                        paddingHorizontal: spacing.sm,
                        paddingVertical: spacing.sm,
                        gap: spacing.sm,
                      },
                    ]}>
                    <View style={{ width: 18, alignItems: 'center' }}>
                      {selected ? <Check size={16} color={colors.success} /> : null}
                    </View>
                    <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    minHeight: 44,
    maxWidth: 320,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(22, 39, 31, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    position: 'relative',
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    zIndex: 1,
    ...Platform.select({
      web: { boxShadow: '0 12px 40px rgba(22, 39, 31, 0.18)' } as object,
      default: {},
    }),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
