import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AuthFormHeader } from '@/features/auth/components/auth-form-header';
import { AuthSsoFailureNotice } from '@/features/auth/components/auth-sso-failure-notice';
import { useSession } from '@/features/auth/providers/session-provider';
import { resolvePostAuthHref } from '@/features/auth/utils/post-auth-redirect';
import {
  captureSsoCallbackHash,
  resolveSsoFailureMessageKey,
} from '@/features/auth/utils/sso-callback';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { FormCard } from '@/shared/components/form-card';
import { ScreenScaffold } from '@/shared/components/screen-scaffold';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function LoginCallbackScreen() {
  const { signInWithSsoCallback, isAuthLoading, authError, clearAuthError } = useSession();
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ success?: string; error?: string }>();
  const started = useRef(false);
  const ssoHashParams = useMemo(() => captureSsoCallbackHash(), []);

  const success = params.success === '1' || params.success === 'true';
  const errorCode = Array.isArray(params.error) ? params.error[0] : params.error;
  const failed =
    params.success === '0' || Boolean(errorCode) || (!success && params.success !== undefined);
  /** Missing query params (wrong FRONTEND_BASE_URL / manual nav) — treat as failure, not a hang. */
  const malformed = !success && !failed && params.success === undefined && !errorCode;
  const showFailed = failed || malformed;
  const failureMessage =
    authError ?? t(resolveSsoFailureMessageKey(malformed ? 'sso_failed' : errorCode));

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
    <ScreenScaffold
      authLayout
      showFooter
      title={showFailed ? t('login.sso.failedTitle') : t('login.sso.callbackTitle')}
      subtitle={showFailed ? t('login.sso.failedSubtitle') : t('login.sso.callbackSubtitle')}>
      <FormCard style={styles.card}>
        {showFailed || authError ? (
          <>
            <AuthSsoFailureNotice message={failureMessage} />
            <AppButton
              fullWidth
              size="compact"
              variant="cta"
              icon={ArrowLeft}
              label={t('login.sso.backLink')}
              onPress={() => {
                router.replace('/(auth)/sign-in');
              }}
            />
          </>
        ) : (
          <>
            <AuthFormHeader
              icon={ShieldCheck}
              title={t('login.sso.completingTitle')}
              subtitle={t('login.sso.completingSubtitle')}
            />
            {isAuthLoading ? (
              <View style={[styles.loading, { paddingVertical: spacing.md }]}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null}
          </>
        )}
      </FormCard>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingTop: 14,
    paddingBottom: 12,
    gap: 14,
  },
  loading: {
    alignItems: 'center',
  },
});
