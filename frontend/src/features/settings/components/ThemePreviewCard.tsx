import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  title: string;
};

export function ThemePreviewCard({ title }: Props) {
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: panelRadius, padding: spacing.md, gap: spacing.sm }]}>
      <Text style={[typography.subtitle, { color: colors.text }]}>{title}</Text>
      <View style={[styles.previewPanel, { borderColor: colors.border, borderRadius: controlRadius, backgroundColor: colors.background, padding: spacing.sm, gap: spacing.xs }]}>
        <Text style={[typography.body, { color: colors.text }]}>{t('settings.theme.preview.sampleHeading')}</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('settings.theme.preview.instantDescription')}</Text>
        <AppButton label={t('settings.branding.primaryButton')} onPress={() => undefined} size="compact" variant="cta" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
  },
  previewPanel: {
    borderWidth: 1,
  },
});
