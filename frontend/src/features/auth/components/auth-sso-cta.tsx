import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

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
  /** Alternate label key (e.g. invite activation). */
  labelKey?: string;
};

/**
 * Web-only Google SSO CTA. Full-page navigate to `/auth/sso/start` (not Axios).
 * Shown when public-config reports `sso_enabled` and an organization slug.
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

  return (
    <View style={[styles.wrap, { gap: spacing.sm }]}>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center' }]}>
        {t('login.sso.or')}
      </Text>
      <AppButton
        fullWidth
        size="compact"
        variant="outline"
        label={t(labelKey)}
        disabled={disabled}
        onPress={() => {
          void navigateToSsoStart(orgSlug);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
});
