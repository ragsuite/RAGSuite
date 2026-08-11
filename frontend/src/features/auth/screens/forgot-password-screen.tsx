import { Mail } from 'lucide-react-native';
import { router } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { AuthLinkPrompt } from '@/features/auth/components/auth-link-prompt';
import { requestPasswordReset } from '@/features/auth/services/password-reset.api';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { FormSuccessBanner } from '@/shared/components/form-success-banner';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { useToast } from '@/shared/toast/use-toast';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

type ForgotPasswordForm = {
  email: string;
};

export function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const reducedMotion = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const schema = z.object({
    email: z.string().trim().email(t('forgot-password.errors.emailRequired')),
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);
    try {
      await requestPasswordReset(values.email);
      const message = t('forgot-password.success.sent');
      setSuccess(message);
      toast({ description: message, variant: 'success' });
    } catch (err) {
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status)
          : undefined;
      const fallbackKey =
        status === 503
          ? 'forgot-password.errors.emailNotConfigured'
          : 'forgot-password.errors.generic';
      const message = resolveAppErrorMessage(err, t, fallbackKey);
      setError(message);
      toast({ description: message, variant: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  });

  const goBack = useCallback(() => {
    router.replace('/(auth)/sign-in');
  }, []);

  return (
    <ScreenScaffold
      authLayout
      showFooter
      title={Platform.OS === 'web' ? t('forgot-password.form.title') : t('login.welcome.mobileTitle', { orgName: BRANDING_DEFAULTS.orgName })}
      subtitle={t('forgot-password.form.subtitle')}>
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          <AuthFormHeader
            icon={Mail}
            title={t('forgot-password.form.title')}
            subtitle={t('forgot-password.form.subtitle')}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { value, onChange } }) => (
              <AppTextField
                label={t('forgot-password.form.email.label')}
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder={t('forgot-password.form.email.placeholder')}
                error={errors.email?.message}
              />
            )}
          />
          {error ? <FormErrorBanner message={error} /> : null}
          {success ? <FormSuccessBanner message={success} /> : null}
          <AppButton
            fullWidth
            size="compact"
            label={isSubmitting ? t('forgot-password.form.submitting') : t('forgot-password.form.submit')}
            disabled={!isValid || isSubmitting}
            loading={isSubmitting}
            onPress={onSubmit}
          />
          <AppButton
            fullWidth
            size="compact"
            variant="outline"
            label={t('forgot-password.form.back')}
            onPress={goBack}
            noTopMargin
          />
          <AuthLinkPrompt
            prompt={t('signup.login.prompt')}
            linkLabel={t('signup.login.link')}
            href="/(auth)/sign-in"
          />
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
