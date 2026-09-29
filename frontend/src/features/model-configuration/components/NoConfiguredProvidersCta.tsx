import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { hrefForAppRoute } from '@/config/navigation';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

/** Empty state for surfaces that pick a configured provider when none is configured yet. */
export function NoConfiguredProvidersCta({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View
      style={[
        styles.box,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <Text style={[typography.headingSemibold, { color: colors.text }]}>{t('models.noConfiguredProviders.title')}</Text>
      <Text style={[typography.body, { color: colors.textMuted }]}>{t('models.noConfiguredProviders.body')}</Text>
      <View style={styles.action}>
        <AppButton
          variant="cta"
          size="compact"
          label={t('models.noConfiguredProviders.cta')}
          onPress={() => {
            onNavigate?.();
            router.push(hrefForAppRoute('model-configuration'));
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1 },
  action: { flexDirection: 'row' },
});
