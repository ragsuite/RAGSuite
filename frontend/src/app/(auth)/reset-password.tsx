import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';
import { useTranslation } from '@/i18n';
import { FormCard } from '@/shared/components/form-card';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

export default function ResetPasswordRoute() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  if (!token?.trim()) {
    return <Redirect href="/(auth)/forgot-password" />;
  }

  return (
    <ScreenScaffold
      authLayout
      showFooter
      title={Platform.OS === 'web' ? t('resetPassword.title') : t('login.welcome.mobileTitle', { orgName: BRANDING_DEFAULTS.orgName })}
      subtitle={t('resetPassword.subtitle')}>
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          <ResetPasswordForm resetToken={token.trim()} />
        </FormCard>
      </Animated.View>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  formCard: {
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
});
