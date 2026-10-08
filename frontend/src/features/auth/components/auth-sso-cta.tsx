import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { GoogleBrandIcon } from '@/shared/components/google-brand-icon';
import { MicrosoftBrandIcon } from '@/shared/components/microsoft-brand-icon';
import type { PublicAuthConfig } from '@/features/auth/types/public-config.types';
import { useTranslation } from '@/i18n';
import { navigateToSsoStart } from '@/network/actions/public-config.actions';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  config: PublicAuthConfig;
  configLoading?: boolean;
  /** Disable while password form is submitting. */
  disabled?: boolean;
  /** Alternate label key for Google (e.g. invite activation). */
  labelKey?: string;
};

type SsoProvider = 'google' | 'microsoft';

/**
 * Web-only SSO CTAs. Full-page navigate to `/auth/sso/start` (not Axios).
 * One button per enabled provider from public-config `ssoProviders`.
 */
export function AuthSsoCta({
  config,
  configLoading = false,
  disabled,
  labelKey = 'login.sso.google',
}: Props) {
  const { t } = useTranslation();
  const { colors, typography, spacing } = useAppTheme();

  if (Platform.OS !== 'web') {
    return null;
  }

  if (configLoading || !config.ssoEnabled || !config.organizationSlug) {
    return null;
  }

  const orgSlug = config.organizationSlug;
  const providers = (config.ssoProviders?.length
    ? config.ssoProviders
    : config.ssoEnabled
      ? (['google'] as SsoProvider[])
      : []) as SsoProvider[];

  const buttons = providers.filter((p): p is SsoProvider => p === 'google' || p === 'microsoft');
  if (buttons.length === 0) {
    return null;
  }

  return (
    <View style={[styles.wrap, { gap: spacing.sm }]}>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
        {t('login.sso.or')}
      </Text>
      {buttons.map((provider) => {
        const isGoogle = provider === 'google';
        return (
          <AppButton
            key={provider}
            fullWidth
            size="compact"
            variant="outline"
            icon={isGoogle ? GoogleBrandIcon : MicrosoftBrandIcon}
            iconSize={20}
            label={t(isGoogle ? labelKey : 'login.sso.microsoft')}
            disabled={disabled}
            onPress={() => {
              void navigateToSsoStart(orgSlug, provider);
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
