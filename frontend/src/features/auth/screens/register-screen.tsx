import { useLocalSearchParams } from 'expo-router';
import { FileText, UserRoundPlus } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { zodResolver } from '@hookform/resolvers/zod';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { AuthLinkPrompt } from '@/features/auth/components/auth-link-prompt';
import { AuthSsoCta } from '@/features/auth/components/auth-sso-cta';
import { createAuthFormSchemas, type SignUpFormValues } from '@/features/auth/hooks/use-auth-form';
import { usePublicAuthConfig } from '@/features/auth/hooks/use-public-auth-config';
import { useSession } from '@/features/auth/providers/session-provider';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { PasswordField } from '@/shared/components/password-field';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

export function RegisterScreen() {
  const { signUpWithPayload, isAuthLoading, authError } = useSession();
  const { config, isLoading: isConfigLoading, refresh: refreshPublicConfig } = usePublicAuthConfig();
  const params = useLocalSearchParams<{ invite?: string }>();
  // Real member invites use sign-in?invite= — this route is first-admin setup when registration is open.
  const isInvite = params.invite === '1' || params.invite === 'true';
  const isFirstAdminSetup = config.registrationEnabled && !isInvite;
  const { t } = useTranslation();
  const { colors, typography, spacing, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { signUpSchema } = useMemo(() => createAuthFormSchemas(t), [t]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<SignUpFormValues>({
    resolver: zodResolver(signUpSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      fullName: '',
      email: '',
      password: '',
      confirmPassword: '',
      agreeToTerms: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const ok = await signUpWithPayload(values);
    if (ok) {
      await refreshPublicConfig();
    }
  });

  return (
    <ScreenScaffold
      authLayout
      showFooter
      title={
        isInvite
          ? t('signup.invite.title')
          : isFirstAdminSetup
            ? t('signup.firstAdmin.title')
            : t('signup.title')
      }
      subtitle={
        isInvite
          ? t('signup.invite.subtitle')
          : isFirstAdminSetup
            ? t('signup.firstAdmin.subtitle')
            : Platform.OS === 'web'
              ? t('signup.subtitle')
              : t('signup.subtitle.mobile')
      }
      webLayout="marketing-right">
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          <AuthFormHeader
            icon={UserRoundPlus}
            title={
              isInvite
                ? t('signup.invite.formTitle')
                : isFirstAdminSetup
                  ? t('signup.firstAdmin.formTitle')
                  : t('auth.form.signUp.title')
            }
            subtitle={
              isInvite
                ? t('signup.invite.formHelper')
                : isFirstAdminSetup
                  ? t('signup.firstAdmin.formHelper')
                  : t('auth.form.signUp.helper')
            }
          />
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
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                placeholder={t('signup.form.email.placeholder')}
                error={errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="fullName"
            render={({ field: { value, onChange } }) => (
              <AppTextField
                label={t('signup.form.username.label')}
                value={value}
                onChangeText={onChange}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                placeholder={t('signup.form.username.placeholder')}
                error={errors.fullName?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={t('signup.form.password.label')}
                value={value}
                onChangeText={onChange}
                placeholder={t('signup.form.password.placeholder')}
                error={errors.password?.message}
                autoComplete="new-password"
              />
            )}
          />
          <Text style={[typography.caption, { color: colors.textMuted }]}>{t('auth.form.passwordHint')}</Text>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { value, onChange } }) => (
              <PasswordField
                label={t('signup.form.confirmPassword.label')}
                value={value}
                onChangeText={onChange}
                placeholder={t('signup.form.confirmPassword.placeholder')}
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
              />
            )}
          />
          <Controller
            control={control}
            name="agreeToTerms"
            render={({ field: { value, onChange } }) => (
              <View
                style={[
                  styles.termsRow,
                  {
                    backgroundColor: colors.surfaceMuted,
                    borderColor: colors.border,
                    borderRadius: surfaceRadius.card,
                    padding: spacing.sm,
                    gap: spacing.sm,
                  },
                ]}>
                <View
                  style={[
                    styles.termsIcon,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.button,
                    },
                  ]}>
                  <FileText size={16} color={colors.primary} />
                </View>
                <Text style={[typography.body, styles.termsLabel, { color: colors.text }]}>
                  {t('signup.form.terms.label')}
                </Text>
                <Switch
                  value={Boolean(value)}
                  onValueChange={onChange}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.surface}
                />
              </View>
            )}
          />
          {errors.agreeToTerms?.message ? <FormErrorBanner message={errors.agreeToTerms.message} /> : null}
          {authError ? <FormErrorBanner message={authError} /> : null}
          <AppButton
            fullWidth
            size="compact"
            label={
              isAuthLoading
                ? t('signup.form.submit.loading')
                : isInvite
                  ? t('signup.invite.submit')
                  : isFirstAdminSetup
                    ? t('signup.firstAdmin.submit')
                    : t('signup.form.submit.label')
            }
            disabled={!isValid}
            loading={isAuthLoading}
            onPress={onSubmit}
          />
          <AuthSsoCta
            config={config}
            configLoading={isConfigLoading}
            disabled={isAuthLoading}
            labelKey={isInvite ? 'signup.invite.sso' : 'login.sso.google'}
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
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  termsIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  termsLabel: {
    flex: 1,
    lineHeight: 20,
  },
});
