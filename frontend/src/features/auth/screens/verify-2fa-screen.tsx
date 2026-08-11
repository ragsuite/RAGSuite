import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { zodResolver } from '@hookform/resolvers/zod';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { createAuthFormSchemas, type Verify2FAFormValues } from '@/features/auth/hooks/use-auth-form';
import { useSession } from '@/features/auth/providers/session-provider';
import { sanitizeOtpDigits } from '@/features/auth/utils/auth-otp-utils';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { FormSuccessBanner } from '@/shared/components/form-success-banner';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

export function Verify2FAScreen() {
  const { tempToken } = useLocalSearchParams<{ tempToken?: string }>();
  const router = useRouter();
  const { verify2FA, resend2FACode, isAuthLoading, authError, clearAuthError } = useSession();
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  const { verify2FASchema } = useMemo(() => createAuthFormSchemas(t), [t]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<Verify2FAFormValues>({
    resolver: zodResolver(verify2FASchema),
    mode: 'onChange',
    defaultValues: { code: '' },
  });

  if (!tempToken) {
    return (
      <ScreenScaffold authLayout showFooter title={t('login.2fa.title')} subtitle={t('login.errors.sessionExpired')}>
        <FormCard style={styles.formCard}>
          <AuthFormHeader icon={ShieldCheck} title={t('login.2fa.cardTitle')} subtitle={t('login.errors.sessionExpired')} />
          <FormErrorBanner message={t('login.errors.sessionExpired')} />
          <Link href="/(auth)/sign-in" style={[styles.linkText, { color: colors.primary }]}>
            {t('verifyEmail.backToLogin')}
          </Link>
        </FormCard>
      </ScreenScaffold>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    clearAuthError();
    setStatusMessage(null);
    await verify2FA({ tempToken, code: values.code });
  });

  const onResend = async () => {
    clearAuthError();
    setStatusMessage(null);
    setIsResending(true);
    try {
      const message = await resend2FACode(tempToken);
      if (message) {
        setStatusMessage(message);
      }
    } finally {
      setIsResending(false);
    }
  };

  const onCancel = () => {
    clearAuthError();
    router.replace('/(auth)/sign-in');
  };

  return (
    <ScreenScaffold authLayout showFooter title={t('login.2fa.title')} subtitle={t('login.2fa.description')}>
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          <AuthFormHeader
            icon={ShieldCheck}
            title={t('login.2fa.cardTitle')}
            subtitle={t('login.2fa.helper')}
          />
          <Controller
            control={control}
            name="code"
            render={({ field: { value, onChange } }) => (
              <AppTextField
                variant="otp"
                label={t('login.2fa.title')}
                value={value}
                onChangeText={(text) => onChange(sanitizeOtpDigits(text))}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('login.2fa.placeholder')}
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                error={errors.code?.message}
              />
            )}
          />
          {authError ? <FormErrorBanner message={authError} /> : null}
          {statusMessage ? <FormSuccessBanner message={statusMessage} /> : null}
          <AppButton
            fullWidth
            size="compact"
            label={isAuthLoading ? t('login.2fa.verifying') : t('login.2fa.verify')}
            disabled={!isValid}
            loading={isAuthLoading}
            onPress={onSubmit}
          />
          <AppButton
            fullWidth
            size="compact"
            variant="outline"
            label={isResending ? t('login.2fa.resending') : t('login.2fa.resend')}
            disabled={isResending}
            loading={isResending}
            onPress={() => void onResend()}
          />
          <AppButton fullWidth size="compact" variant="ghost" label={t('login.2fa.cancel')} onPress={onCancel} />
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
  linkText: {
    textAlign: 'center',
    marginTop: 4,
  },
});
