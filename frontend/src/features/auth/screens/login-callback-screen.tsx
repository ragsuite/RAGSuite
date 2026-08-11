import { useLocalSearchParams, useRouter } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { AuthLinkPrompt } from '@/features/auth/components/auth-link-prompt';
import { useSession } from '@/features/auth/providers/session-provider';
import { resolvePostAuthHref } from '@/features/auth/utils/post-auth-redirect';
import { captureSsoCallbackHash } from '@/features/auth/utils/sso-callback';
import { useTranslation } from '@/i18n';
import { FormCard } from '@/shared/components/form-card';
import { FormErrorBanner } from '@/shared/components/form-error-banner';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function LoginCallbackScreen() {
  const { signInWithSsoCallback, isAuthLoading, authError, clearAuthError } = useSession();
  const { t } = useTranslation();
  const { colors, typography, spacing } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ success?: string; error?: string }>();
  const started = useRef(false);
  const ssoHashParams = useMemo(() => captureSsoCallbackHash(), []);

  const success = params.success === '1' || params.success === 'true';
  const failed =
    params.success === '0' || Boolean(params.error) || (!success && params.success !== undefined);
  /** Missing query params (wrong FRONTEND_BASE_URL / manual nav) — treat as failure, not a hang. */
  const malformed = !success && !failed && params.success === undefined && !params.error;
  const showFailed = failed || malformed;

  useEffect(() => {
    if (started.current) return;
    if (showFailed) {
      clearAuthError();
      return;
    }
    if (!success) return;

    started.current = true;
    void (async () => {
      const result = await signInWithSsoCallback(ssoHashParams);
      if (result.ok) {
        router.replace(resolvePostAuthHref(result.session, result.redirectPath));
      }
    })();
  }, [clearAuthError, router, showFailed, signInWithSsoCallback, ssoHashParams, success]);

  return (
    <ScreenScaffold authLayout showFooter title={t('login.sso.callbackTitle')} subtitle={t('login.sso.callbackSubtitle')}>
      <FormCard style={styles.card}>
        <AuthFormHeader
          icon={ShieldCheck}
          title={showFailed ? t('login.sso.failedTitle') : t('login.sso.completingTitle')}
          subtitle={showFailed ? t('login.sso.failedSubtitle') : t('login.sso.completingSubtitle')}
        />
        {!showFailed && isAuthLoading ? (
          <View style={[styles.loading, { gap: spacing.md }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>
              {t('login.sso.completingSubtitle')}
            </Text>
          </View>
        ) : null}
        {showFailed || authError ? (
          <FormErrorBanner message={authError ?? t('login.sso.failedGeneric')} />
        ) : null}
        {showFailed || authError ? (
          <AuthLinkPrompt prompt={t('login.sso.backPrompt')} linkLabel={t('login.sso.backLink')} href="/(auth)/sign-in" />
        ) : null}
      </FormCard>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  loading: {
    alignItems: 'center',
    paddingVertical: 12,
  },
});
