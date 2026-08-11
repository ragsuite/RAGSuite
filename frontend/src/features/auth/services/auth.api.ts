import type {
  AuthSession,
  ResendVerificationPayload,
  SignInPayload,
  SignInResult,
  SignUpPayload,
  SignUpResult,
  Verify2FAPayload,
  VerifyEmailPayload,
} from '@/features/auth/auth.types';
import type { Login2FAResendResponse, ResendVerificationResponse } from '@/features/auth/types/auth.api.types';
import { COOKIE_SESSION_TOKEN } from '@/features/auth/auth.constants';
import {
  handleHydrateCookieSession,
  handleLogin,
  handleRegister,
  handleResendLogin2FA,
  handleResendVerification,
  handleVerifyAuthToken,
  handleVerifyEmail,
  handleVerifyLogin2FA,
} from '@/network/actions/auth.actions';
import { resolveHasCompletedOnboarding } from '@/features/onboarding/services/onboarding.service';
import { mapAuthSession } from '@/features/auth/utils/auth-mappers';
import { handleGetUserProfile } from '@/network/actions/profile.actions';
import { isCookieSessionToken } from '@/network/auth-session';

export async function signIn(payload: SignInPayload): Promise<SignInResult> {
  return handleLogin(payload);
}

export async function signUp(payload: SignUpPayload): Promise<SignUpResult> {
  return handleRegister(payload);
}

export async function verifyLogin2FA(payload: Verify2FAPayload): Promise<AuthSession> {
  return handleVerifyLogin2FA(payload);
}

export async function resendLogin2FA(tempToken: string): Promise<Login2FAResendResponse> {
  return handleResendLogin2FA(tempToken);
}

export async function verifyEmail(payload: VerifyEmailPayload): Promise<AuthSession> {
  return handleVerifyEmail(payload);
}

export async function resendVerificationEmail(
  payload: ResendVerificationPayload,
): Promise<ResendVerificationResponse> {
  return handleResendVerification(payload);
}

export async function hydrateCookieSession(): Promise<AuthSession> {
  return handleHydrateCookieSession();
}

export async function verifyStoredSession(accessToken: string): Promise<AuthSession> {
  if (isCookieSessionToken(accessToken)) {
    return handleHydrateCookieSession();
  }

  const verified = await handleVerifyAuthToken();
  // Verify wire often omits `is_admin` → toUserResponse defaults false.
  // Prefer profile; if profile fails, keep verify fields but do not treat missing
  // is_admin as authoritative (caller merges with stored session flags).
  let user = verified;
  try {
    const profile = await handleGetUserProfile();
    user = {
      ...verified,
      username: profile.username || verified.username,
      email: profile.email || verified.email,
      is_active: profile.is_active,
      is_admin: profile.is_admin,
      created_at: profile.created_at,
      last_login: profile.last_login,
    };
  } catch (error) {
    // `/crawl/auth/verify` omits `is_admin`; profile is required for role-aware routing.
    throw error instanceof Error ? error : new Error('errors.auth.ssoHydrateFailed');
  }

  let hasCompletedOnboarding = false;
  try {
    hasCompletedOnboarding = await resolveHasCompletedOnboarding();
  } catch {
    hasCompletedOnboarding = false;
  }
  return mapAuthSession(accessToken || COOKIE_SESSION_TOKEN, user, { hasCompletedOnboarding });
}

export async function markOnboardingComplete(_email: string) {
  // Onboarding completion is tracked in the local session only.
}
