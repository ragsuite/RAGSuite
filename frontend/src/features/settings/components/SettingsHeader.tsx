import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function SettingsHeader() {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  return (
    <View style={[styles.root, { gap: spacing.xs }]}>
      <Text style={[typography.pageDisplay, { color: colors.text }]}>{t('settings.title')}</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{t('settings.subtitle')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
});
