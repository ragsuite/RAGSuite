import { Image } from 'expo-image';
import { Sparkles } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const BRAND_ICON = require('@/assets/app-brand-icon.png');

export function SplashScreen() {
  const { colors, typography, spacing, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.card,
          {
            borderRadius: surfaceRadius.card,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            padding: spacing.xl,
            gap: spacing.md,
          },
        ]}>
        <Image source={BRAND_ICON} style={styles.brandIcon} contentFit="contain" />
        <Text style={[typography.pageDisplay, { color: colors.text, textAlign: 'center' }]}>{BRANDING_DEFAULTS.orgName}</Text>
        <View style={styles.badge}>
          <Sparkles size={15} color={BRANDING_DEFAULTS.primaryColor} />
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            {t('common.premiumWorkspace')}
          </Text>
        </View>
        <ActivityIndicator size="small" color={BRANDING_DEFAULTS.primaryColor} />
        <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
          {t('auth.splash.loading')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
          {t('login.brand.tagline')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    borderWidth: 1,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandIcon: {
    width: 64,
    height: 64,
  },
});
