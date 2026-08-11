import { Link, useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { zodResolver } from '@hookform/resolvers/zod';

import { AuthEmailChip } from '@/features/auth/components/auth-email-chip';
import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { createAuthFormSchemas, type VerifyEmailFormValues } from '@/features/auth/hooks/use-auth-form';
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
import { useToast } from '@/shared/toast/use-toast';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

export function VerifyEmailScreen() {
  const { email: emailParam, message: messageParam } = useLocalSearchParams<{
    email?: string;
    message?: string;
  }>();
  const { verifyEmailAndSignIn, resendEmailVerification, isAuthLoading, authError, clearAuthError } =
    useSession();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { colors } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const emailFromParam = typeof emailParam === 'string' ? emailParam : '';
  const isEmailLocked = Boolean(emailFromParam);

  const { verifyEmailSchema } = useMemo(() => createAuthFormSchemas(t), [t]);

  const {
    control,
    handleSubmit,
    getValues,
    watch,
    formState: { errors, isValid },
  } = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailSchema),
    mode: 'onChange',
    defaultValues: {
      email: emailFromParam,
      code: '',
    },
  });

  const watchedEmail = watch('email');

  const onSubmit = handleSubmit(async (values) => {
    clearAuthError();
    setStatusMessage(null);
    setResendError(null);
    await verifyEmailAndSignIn(values);
  });

  const onResend = async () => {
    clearAuthError();
    setStatusMessage(null);
    setResendError(null);
    const email = getValues('email').trim();
    if (!email) {
      const message = t('verifyEmail.errors.missingEmail');
      setResendError(message);
      toast({ description: message, variant: 'error' });
      return;
    }
    setIsResending(true);
    try {
      const message = await resendEmailVerification({ email });
      if (message) {
        setStatusMessage(message);
      }
    } finally {
      setIsResending(false);
    }
  };

  return (
    <ScreenScaffold
      authLayout
      showFooter
      title={t('verifyEmail.checkTitle')}
      subtitle={t('verifyEmail.checkSubtitleOtp')}
      webLayout="marketing-right">
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          <AuthFormHeader
            icon={MailCheck}
            title={t('verifyEmail.checkTitle')}
            subtitle={messageParam ?? t('auth.form.verifyEmail.helper')}
          />
          {isEmailLocked ? (
            <AuthEmailChip email={watchedEmail} label={t('auth.form.verifyEmail.sentTo')} />
          ) : (
            <Controller
              control={control}
              name="email"
              render={({ field: { value, onChange } }) => (
                <AppTextField
                  label={t('signup.form.email.label')}
                  value={value}
                  onChangeText={onChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder={t('signup.form.email.placeholder')}
                  error={errors.email?.message}
                />
              )}
            />
          )}
          <Controller
            control={control}
            name="code"
            render={({ field: { value, onChange } }) => (
              <AppTextField
                variant="otp"
                label={t('verifyEmail.otpLabel')}
                value={value}
                onChangeText={(text) => onChange(sanitizeOtpDigits(text))}
                keyboardType="number-pad"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('verifyEmail.otpPlaceholder')}
                maxLength={6}
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                error={errors.code?.message}
              />
            )}
          />
          {authError ? <FormErrorBanner message={authError} /> : null}
          {resendError ? <FormErrorBanner message={resendError} /> : null}
          {statusMessage ? <FormSuccessBanner message={statusMessage} /> : null}
          <AppButton
            fullWidth
            size="compact"
            label={isAuthLoading ? t('verifyEmail.verifying') : t('verifyEmail.verifyButton')}
            disabled={!isValid}
            loading={isAuthLoading}
            onPress={onSubmit}
          />
          <AppButton
            fullWidth
            size="compact"
            variant="outline"
            label={isResending ? t('verifyEmail.resending') : t('verifyEmail.resendButton')}
            disabled={isResending}
            loading={isResending}
            onPress={() => void onResend()}
          />
          <Link href="/(auth)/sign-in" style={[styles.linkText, { color: colors.primary }]}>
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
  linkText: {
    textAlign: 'center',
    marginTop: 4,
  },
});
