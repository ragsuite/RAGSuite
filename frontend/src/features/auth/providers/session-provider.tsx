import { useRouter } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { AUTH_STORAGE_KEY, COOKIE_SESSION_TOKEN } from '@/features/auth/auth.constants';
import {
  hydrateCookieSession,
  markOnboardingComplete,
  resendLogin2FA,
  resendVerificationEmail,
  signIn,
  signUp,
  verifyEmail,
  verifyLogin2FA,
  verifyStoredSession,
} from '@/features/auth/services/auth.api';
import type {
  AuthSession,
  ResendVerificationPayload,
  SignInPayload,
  SignUpPayload,
  Verify2FAPayload,
  VerifyEmailPayload,
} from '@/features/auth/auth.types';
import { handleLogout } from '@/network/actions/auth.actions';
import { onUnauthorized } from '@/network/auth-events';
import {
  clearAuthSession,
  hydrateAuthTokenFromStorage,
  isCookieSessionToken,
  setAccessToken,
  setAuthBootstrapping,
} from '@/network/auth-session';
import { storage } from '@/services/storage/storage';
import { useTranslation } from '@/i18n';
import { buildSessionFromSsoHash } from '@/features/auth/utils/build-session-from-sso-hash';
import {
  captureSsoCallbackHash,
  clearSsoCallbackHash,
  isPendingSsoCallback,
} from '@/features/auth/utils/sso-callback';
import { useToastRef } from '@/shared/toast/use-toast-ref';

const AUTH_ERROR_KEYS = {
  invalidCredentials: 'login.errors.invalidCredentials',
  emailAlreadyInUse: 'signup.errors.emailAlreadyInUse',
  usernameAlreadyInUse: 'signup.errors.usernameAlreadyInUse',
  invalidVerificationCode: 'verifyEmail.errors.verifyFailed',
  invalid2FACode: 'login.errors.invalid2FACode',
  sessionExpired: 'login.errors.sessionExpired',
  generic: 'login.errors.generic',
} as const;

function resolveAuthErrorMessage(
  t: (key: string) => string,
  error: unknown,
  fallbackKey: keyof typeof AUTH_ERROR_KEYS,
): string {
  if (error instanceof Error) {
    if (
      error.message === 'errors.network.noResponse' ||
      error.message.toLowerCase().includes('network') ||
      error.message.toLowerCase().includes('econnrefused')
    ) {
      return t('errors.network.unavailable.description');
    }
    if (error.message.includes('.')) {
      return t(error.message);
    }
    const matchedKey = (Object.keys(AUTH_ERROR_KEYS) as Array<keyof typeof AUTH_ERROR_KEYS>).find(
      (key) => error.message === key || error.message.toLowerCase().includes(key.toLowerCase()),
    );
    if (matchedKey) {
      return t(AUTH_ERROR_KEYS[matchedKey]);
    }
    return error.message;
  }
  return t(AUTH_ERROR_KEYS[fallbackKey]);
}

type SsoCallbackResult =
  | { ok: true; session: AuthSession; redirectPath?: string | null }
  | { ok: false };

type SessionContextValue = {
  isBooting: boolean;
  isAuthenticated: boolean;
  session: AuthSession | null;
  authError: string | null;
  isAuthLoading: boolean;
  finishBoot: () => Promise<void>;
  signInWithCredentials: (payload: SignInPayload) => Promise<boolean>;
  signInWithCookieSession: () => Promise<boolean>;
  signInWithSsoCallback: (hashParams?: URLSearchParams) => Promise<SsoCallbackResult>;
  signUpWithPayload: (payload: SignUpPayload) => Promise<boolean>;
  verify2FA: (payload: Verify2FAPayload) => Promise<boolean>;
  resend2FACode: (tempToken: string) => Promise<string | null>;
  verifyEmailAndSignIn: (payload: VerifyEmailPayload) => Promise<boolean>;
  resendEmailVerification: (payload: ResendVerificationPayload) => Promise<string | null>;
  signOut: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  persistSessionFromInvite: (session: AuthSession) => Promise<void>;
  clearAuthError: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function SessionProvider({ children }: Props) {
  const router = useRouter();
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const [isBooting, setIsBooting] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const persistSession = useCallback(async (nextSession: AuthSession | null) => {
    setSession(nextSession);
    setAccessToken(nextSession?.accessToken ?? null);

    if (nextSession) {
      await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(nextSession));
      return;
    }

    await clearAuthSession();
  }, []);

  const clearAuthError = useCallback(() => {
    setAuthError(null);
  }, []);

  const reportAuthError = useCallback(
    (message: string) => {
      setAuthError(message);
      toastRef.current({ description: message, variant: 'error' });
    },
    [toastRef],
  );

  const finishBoot = useCallback(() => {
    return (async () => {
      if (isPendingSsoCallback()) {
        setAuthBootstrapping(false);
        setIsBooting(false);
        return;
      }

      setAuthBootstrapping(true);
      try {
        await hydrateAuthTokenFromStorage();
        const rawSession = await storage.getItem(AUTH_STORAGE_KEY);
        if (!rawSession) {
          return;
        }

        const storedSession = JSON.parse(rawSession) as AuthSession;
        const token = storedSession.accessToken ?? null;
        setAccessToken(token);
        setSession(storedSession);

        try {
          const verifiedSession = await verifyStoredSession(token ?? COOKIE_SESSION_TOKEN);
          // `/crawl/auth/verify` wire omits `is_admin`; profile enrich can fail.
          // Preserve known admin/onboarding flags from the stored session when verify
          // cannot assert them (avoids wiping org-admin nav after a transient profile error).
          const mergedSession: AuthSession = {
            ...verifiedSession,
            user: {
              ...verifiedSession.user,
              isAdmin: verifiedSession.user.isAdmin || storedSession.user.isAdmin,
              hasCompletedOnboarding:
                verifiedSession.user.hasCompletedOnboarding ||
                storedSession.user.hasCompletedOnboarding,
            },
          };
          setSession(mergedSession);
          await storage.setItem(AUTH_STORAGE_KEY, JSON.stringify(mergedSession));
        } catch (error) {
          const message = error instanceof Error ? error.message.toLowerCase() : '';
          const isNetworkError =
            message.includes('internet') || message.includes('network') || message.includes('connection');

          if (isNetworkError) {
            return;
          }

          await clearAuthSession();
          setSession(null);
          setAccessToken(null);
        }
      } catch {
        reportAuthError(t(AUTH_ERROR_KEYS.generic));
      } finally {
        setAuthBootstrapping(false);
        setIsBooting(false);
      }
    })();
  }, [reportAuthError, t]);

  useEffect(() => {
    void finishBoot();
  }, [finishBoot]);

  useEffect(() => {
    return onUnauthorized(() => {
      if (isBooting) {
        return;
      }
      setSession(null);
      setAccessToken(null);
      toastRef.current({
        id: 'session-expired',
        title: t('login.sessionExpired.title'),
        description: t('login.sessionExpired.description'),
        variant: 'info',
      });
      router.replace('/(auth)/sign-in');
    });
  }, [isBooting, router, t, toastRef]);

  const signInWithCredentials = useCallback(
    async (payload: SignInPayload) => {
      setAuthError(null);
      setIsAuthLoading(true);
      try {
        const result = await signIn(payload);
        if (result.kind === 'requires_2fa') {
          router.push({
            pathname: '/(auth)/verify-2fa',
            params: { tempToken: result.tempToken },
          });
          return true;
        }

        await persistSession(result.session);
        return true;
      } catch (error) {
        const message = resolveAuthErrorMessage(t, error, 'generic');
        reportAuthError(message);
        return false;
      } finally {
        setIsAuthLoading(false);
      }
    },
    [persistSession, reportAuthError, router, t],
  );

  const signInWithCookieSession = useCallback(async () => {
    setAuthError(null);
    setIsAuthLoading(true);
    try {
      const nextSession = await hydrateCookieSession();
      await persistSession(nextSession);
      return true;
    } catch (error) {
      const message = resolveAuthErrorMessage(t, error, 'generic');
      reportAuthError(message);
      return false;
    } finally {
      setIsAuthLoading(false);
    }
  }, [persistSession, reportAuthError, t]);

  const signInWithSsoCallback = useCallback(
    async (hashParams?: URLSearchParams): Promise<SsoCallbackResult> => {
      setAuthError(null);
      setIsAuthLoading(true);
      setAuthBootstrapping(true);
      try {
        await clearAuthSession();
        setSession(null);
        setAccessToken(null);

        const params = hashParams ?? captureSsoCallbackHash();
        const accessToken = params.get('access_token')?.trim();
        const redirectPath = params.get('redirect_path');

        if (accessToken) {
          clearSsoCallbackHash();
          setAccessToken(accessToken);

          try {
            const nextSession = await verifyStoredSession(accessToken);
            await persistSession(nextSession);
            return { ok: true, session: nextSession, redirectPath };
          } catch (verifyError) {
            const fallbackSession = buildSessionFromSsoHash(accessToken, params);
            if (fallbackSession) {
              await persistSession(fallbackSession);
              return { ok: true, session: fallbackSession, redirectPath };
            }
            throw verifyError;
          }
        }

        if (isPendingSsoCallback()) {
          throw new Error('errors.auth.ssoHydrateFailed');
        }

        const nextSession = await hydrateCookieSession();
        await persistSession(nextSession);
        return { ok: true, session: nextSession };
      } catch (error) {
        const message = resolveAuthErrorMessage(t, error, 'generic');
        reportAuthError(message);
        return { ok: false };
      } finally {
        setAuthBootstrapping(false);
        setIsAuthLoading(false);
      }
    },
    [persistSession, reportAuthError, t],
  );

  const signUpWithPayload = useCallback(
    async (payload: SignUpPayload) => {
      setAuthError(null);
      setIsAuthLoading(true);
      try {
        const result = await signUp(payload);
        router.push({
          pathname: '/(auth)/check-email',
          params: { email: result.email, message: result.message },
        });
        return true;
      } catch (error) {
        const message = resolveAuthErrorMessage(t, error, 'generic');
        reportAuthError(message);
        return false;
      } finally {
        setIsAuthLoading(false);
      }
    },
    [reportAuthError, router, t],
  );

  const verify2FA = useCallback(
    async (payload: Verify2FAPayload) => {
      setAuthError(null);
      setIsAuthLoading(true);
      try {
        const nextSession = await verifyLogin2FA(payload);
        await persistSession(nextSession);
        return true;
      } catch (error) {
        const message = resolveAuthErrorMessage(t, error, 'invalid2FACode');
        reportAuthError(message);
        return false;
      } finally {
        setIsAuthLoading(false);
      }
    },
    [persistSession, reportAuthError, t],
  );

  const resend2FACode = useCallback(async (tempToken: string) => {
    setAuthError(null);
    try {
      const response = await resendLogin2FA(tempToken);
      const message = response.message ?? t('login.2fa.resendSuccess');
      toastRef.current({ description: message, variant: 'success' });
      return message;
    } catch (error) {
      const message = resolveAuthErrorMessage(t, error, 'generic');
      reportAuthError(message);
      return null;
    }
  }, [reportAuthError, t, toastRef]);

  const verifyEmailAndSignIn = useCallback(
    async (payload: VerifyEmailPayload) => {
      setAuthError(null);
      setIsAuthLoading(true);
      try {
        const nextSession = await verifyEmail(payload);
        await persistSession(nextSession);
        return true;
      } catch (error) {
        const message = resolveAuthErrorMessage(t, error, 'invalidVerificationCode');
        reportAuthError(message);
        return false;
      } finally {
        setIsAuthLoading(false);
      }
    },
    [persistSession, reportAuthError, t],
  );

  const resendEmailVerification = useCallback(async (payload: ResendVerificationPayload) => {
    setAuthError(null);
    try {
      const response = await resendVerificationEmail(payload);
      const message = response.message ?? t('verifyEmail.resendSuccess');
      toastRef.current({ description: message, variant: 'success' });
      return message;
    } catch (error) {
      const message = resolveAuthErrorMessage(t, error, 'generic');
      reportAuthError(message);
      return null;
    }
  }, [reportAuthError, t, toastRef]);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await handleLogout();
    await persistSession(null);
  }, [persistSession]);

  const completeOnboarding = useCallback(async () => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: AuthSession = {
        ...prev,
        user: {
          ...prev.user,
          hasCompletedOnboarding: true,
        },
      };
      void persistSession(next);
      void markOnboardingComplete(next.user.email);
      return next;
    });
  }, [persistSession]);

  const persistSessionFromInvite = useCallback(
    async (nextSession: AuthSession) => {
      setAuthError(null);
      await persistSession(nextSession);
    },
    [persistSession],
  );

  const value = useMemo(
    () => ({
      isBooting,
      isAuthenticated: Boolean(session?.accessToken) || isCookieSessionToken(session?.accessToken),
      session,
      authError,
      isAuthLoading,
      finishBoot,
      signInWithCredentials,
      signInWithCookieSession,
      signInWithSsoCallback,
      signUpWithPayload,
      verify2FA,
      resend2FACode,
      verifyEmailAndSignIn,
      resendEmailVerification,
      signOut,
      completeOnboarding,
      persistSessionFromInvite,
      clearAuthError,
    }),
    [
      authError,
      clearAuthError,
      completeOnboarding,
      finishBoot,
      isAuthLoading,
      isBooting,
      persistSessionFromInvite,
      resend2FACode,
      resendEmailVerification,
      session,
      signInWithCredentials,
      signInWithCookieSession,
      signInWithSsoCallback,
      signOut,
      signUpWithPayload,
      verify2FA,
      verifyEmailAndSignIn,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used inside SessionProvider');
  }
  return context;
}
