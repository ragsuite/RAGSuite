import { Link, useLocalSearchParams, router } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { AuthEmailChip } from '@/features/auth/components/auth-email-chip';
import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { FormCard } from '@/shared/components/form-card';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

/** Post-registration email confirmation — routes to OTP entry on verify-email. */
export function CheckEmailScreen() {
  const { email: emailParam } = useLocalSearchParams<{ email?: string }>();
  const { t } = useTranslation();
  const { typography, colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const email = useMemo(() => (typeof emailParam === 'string' ? emailParam : ''), [emailParam]);

  return (
    <ScreenScaffold
      authLayout
      showFooter
      title={t('verifyEmail.title')}
      subtitle={t('verifyEmail.subtitle')}>
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          <AuthFormHeader
            icon={MailCheck}
            title={t('verifyEmail.title')}
            subtitle={t('verifyEmail.subtitle')}
          />
          {email ? <AuthEmailChip email={email} /> : null}
          <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22, textAlign: 'center' }]}>
            {t('verifyEmail.resend.helper')}
          </Text>
          <AppButton
            fullWidth
            size="compact"
            label={t('verifyEmail.form.submit.label')}
            onPress={() =>
              router.push({
                pathname: '/(auth)/verify-email',
                params: email ? { email } : undefined,
              })
            }
          />
          <Link href="/(auth)/sign-in" style={[typography.body, { color: colors.primary, textAlign: 'center', fontWeight: '500' }]}>
            {t('verifyEmail.backToLogin')}
          </Link>
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
