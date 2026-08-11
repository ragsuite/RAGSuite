import { Link, useLocalSearchParams } from 'expo-router';
import { KeyRound } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Platform, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { zodResolver } from '@hookform/resolvers/zod';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { AuthLinkPrompt } from '@/features/auth/components/auth-link-prompt';
import { AuthSsoCta } from '@/features/auth/components/auth-sso-cta';
import { InviteSignInForm } from '@/features/auth/components/invite-sign-in-form';
import { createAuthFormSchemas, type SignInFormValues } from '@/features/auth/hooks/use-auth-form';
import { usePublicAuthConfig } from '@/features/auth/hooks/use-public-auth-config';
import { useSession } from '@/features/auth/providers/session-provider';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { FormCard } from '@/shared/components/form-card';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { PasswordField } from '@/shared/components/password-field';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { fadeInDownEntering } from '@/shared/utils/motion-entering';

function resolveInviteToken(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function SignInScreen() {
  const params = useLocalSearchParams<{ invite?: string | string[] }>();
  const inviteToken = resolveInviteToken(params.invite);
  const isInviteFlow = Boolean(inviteToken);

  const { signInWithCredentials, isAuthLoading, authError } = useSession();
  const { config, isLoading: isConfigLoading } = usePublicAuthConfig();
  const { t } = useTranslation();
  const { colors, typography } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const { signInSchema } = useMemo(() => createAuthFormSchemas(t), [t]);

  const showRegisterLink = config.registrationEnabled && !isInviteFlow;

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<SignInFormValues>({
    resolver: zodResolver(signInSchema),
    mode: 'onChange',
    reValidateMode: 'onChange',
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    await signInWithCredentials(values);
  });

  return (
    <ScreenScaffold
      authLayout
      showFooter
      title={
        isInviteFlow
          ? t('inviteSetup.title')
          : Platform.OS === 'web'
            ? t('login.welcome.title')
            : t('login.welcome.mobileTitle', { orgName: BRANDING_DEFAULTS.orgName })
      }
      subtitle={
        isInviteFlow
          ? t('inviteSetup.subtitle')
          : Platform.OS === 'web'
            ? t('login.welcome.subtitle')
            : t('login.welcome.mobileSubtitle')
      }>
      <Animated.View entering={fadeInDownEntering(reducedMotion)}>
        <FormCard style={styles.formCard}>
          {isInviteFlow && inviteToken ? (
            <InviteSignInForm inviteToken={inviteToken} headerIcon={KeyRound} />
          ) : (
            <>
              <AuthFormHeader
                icon={KeyRound}
                title={t('auth.form.signIn.title')}
                subtitle={t('auth.form.signIn.helper')}
              />
              <Controller
                control={control}
                name="email"
                render={({ field: { value, onChange } }) => (
                  <AppTextField
                    label={t('login.form.username.label')}
                    value={value}
                    onChangeText={onChange}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="username"
                    textContentType="username"
                    placeholder={t('login.form.username.placeholder')}
                    error={errors.email?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="password"
                render={({ field: { value, onChange } }) => (
                  <PasswordField
                    label={t('login.form.password.label')}
                    value={value}
                    onChangeText={onChange}
                    placeholder={t('login.form.password.placeholder')}
                    error={errors.password?.message}
                  />
                )}
              />
              {authError ? <FormErrorBanner message={authError} /> : null}
              <Link
                href="/(auth)/forgot-password"
                style={[
                  typography.caption,
                  { color: colors.primary, textAlign: 'right', alignSelf: 'flex-end' },
                ]}>
                {t('forgot-password.form.title')}
              </Link>
              <AppButton
                fullWidth
                size="compact"
                label={isAuthLoading ? t('login.form.submit.loading') : t('login.form.submit.label')}
                disabled={!isValid}
                loading={isAuthLoading}
                onPress={onSubmit}
              />
              <AuthSsoCta config={config} configLoading={isConfigLoading} disabled={isAuthLoading} />
              {showRegisterLink ? (
                <AuthLinkPrompt
                  prompt={t('login.signup.prompt')}
                  linkLabel={Platform.OS === 'web' ? t('login.signup.link') : t('login.signup.mobileLink')}
                  href="/(auth)/register"
                />
              ) : null}
            </>
          )}
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
