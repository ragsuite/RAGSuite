import { useLocalSearchParams } from 'expo-router';
import { UserRoundPlus } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { PasswordField } from '@/shared/components/password-field';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { PRODUCT_LINKS } from '@/shared/constants/product-links';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

export function RegisterScreen() {
  const { signUpWithPayload, isAuthLoading, clearAuthError } = useSession();
  const { config, isLoading: isConfigLoading, refresh: refreshPublicConfig } = usePublicAuthConfig();
  const params = useLocalSearchParams<{ invite?: string }>();
  // Real member invites use sign-in?invite= — this route is first-admin setup when registration is open.
  const isInvite = params.invite === '1' || params.invite === 'true';
  const isFirstAdminSetup = config.registrationEnabled && !isInvite;
  const { t } = useTranslation();
  const { colors, typography, spacing } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { signUpSchema } = useMemo(() => createAuthFormSchemas(t), [t]);
  const termsLinkStyle = useMemo(
    () => [
      typography.body,
      styles.termsLink,
      { color: colors.primary, textDecorationColor: colors.primary },
    ],
    [colors.primary, typography.body],
  );

  useEffect(() => {
    clearAuthError();
  }, [clearAuthError]);

  const openExternalUrl = useCallback((url: string) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    void Linking.openURL(url);
  }, []);

  const onTermsLinkPress = useCallback(
    (url: string) => (event?: { stopPropagation?: () => void }) => {
      event?.stopPropagation?.();
      openExternalUrl(url);
    },
    [openExternalUrl],
  );

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
            render={({ field: { value, onChange } }) => {
              const checked = Boolean(value);
              return (
                <View style={[styles.termsBlock, { gap: spacing.xs }]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked }}
                    onPress={() => onChange(!checked)}
                    style={[styles.termsRow, { gap: spacing.sm }]}>
                    <AppCheckboxMark checked={checked} size={20} />
                    <Text style={[typography.body, styles.termsLabel, { color: colors.textMuted }]}>
                      {t('signup.form.terms.prefix')}
                      <Text
                        accessibilityRole="link"
                        style={termsLinkStyle}
                        onPress={onTermsLinkPress(PRODUCT_LINKS.terms)}>
                        {t('signup.form.terms.termsLink')}
                      </Text>
                      {t('signup.form.terms.and')}
                      <Text
                        accessibilityRole="link"
                        style={termsLinkStyle}
                        onPress={onTermsLinkPress(PRODUCT_LINKS.datenschutz)}>
                        {t('signup.form.terms.privacyLink')}
                      </Text>
                      {t('signup.form.terms.suffix')}
                    </Text>
                  </Pressable>
                  {errors.agreeToTerms?.message ? (
                    <Text style={[typography.caption, { color: colors.danger }]}>
                      {errors.agreeToTerms.message}
                    </Text>
                  ) : null}
                </View>
              );
            }}
          />
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
  termsBlock: {
    alignSelf: 'stretch',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termsLabel: {
    flex: 1,
    lineHeight: 22,
  },
  termsLink: {
    textDecorationLine: 'underline',
  },
});
