import type {
  Login2FAResendRequest,
  Login2FAResendResponse,
  Login2FARequest,
  Login2FAResponse,
  LoginResponse,
  RegistrationPendingResponse,
  ResendVerificationRequest,
  ResendVerificationResponse,
  UserCreateRequest,
  UserLoginRequest,
  UserResponse,
  VerifyEmailRequest,
  VerifyEmailResponse,
} from '@/features/auth/types/auth.api.types';
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
import { COOKIE_SESSION_TOKEN } from '@/features/auth/auth.constants';
import { mapAuthSession } from '@/features/auth/utils/auth-mappers';
import { resolveHasCompletedOnboarding } from '@/features/onboarding/services/onboarding.service';
import { handleGetUserProfile } from '@/network/actions/profile.actions';
import { API_CONFIG } from '@/network/apiUrl';
import { setAccessToken } from '@/network/auth-session';
import { get, post } from '@/network/request';

type VerifyAuthWireResponse = {
  valid?: boolean;
  user?: {
    id: number;
    username: string;
    email: string;
  };
  message?: string;
};

function toUserResponse(
  user: { id: number; username: string; email: string },
  extras?: { is_active?: boolean; is_admin?: boolean; created_at?: string; last_login?: string | null },
): UserResponse {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    is_active: extras?.is_active ?? true,
    is_admin: extras?.is_admin ?? false,
    created_at: extras?.created_at ?? new Date().toISOString(),
    last_login: extras?.last_login ?? null,
  };
}

export async function handleLogin(payload: SignInPayload): Promise<SignInResult> {
  const body: UserLoginRequest = {
    username: payload.email.trim(),
    password: payload.password,
  };

  const response = (await post<UserLoginRequest, LoginResponse>(API_CONFIG.AUTH_LOGIN, body, {
    skipAuth: true,
  })) as LoginResponse;

  if (response.requires_2fa) {
    if (!response.temp_token) {
      throw new Error('errors.auth.twoFactorTokenMissing');
    }
    return { kind: 'requires_2fa', tempToken: response.temp_token };
  }

  if (!response.access_token || !response.user) {
    throw new Error('errors.auth.invalidLoginResponse');
  }

  setAccessToken(response.access_token);
  let hasCompletedOnboarding = false;
  try {
    hasCompletedOnboarding = await resolveHasCompletedOnboarding();
  } catch {
    hasCompletedOnboarding = false;
  }

  return {
    kind: 'session',
    session: mapAuthSession(response.access_token, response.user, {
      tokenType: response.token_type ?? 'bearer',
      hasCompletedOnboarding,
    }),
  };
}

export async function handleVerifyLogin2FA(payload: Verify2FAPayload) {
  const body: Login2FARequest = {
    temp_token: payload.tempToken,
    code: payload.code.trim(),
  };

  const response = (await post<Login2FARequest, Login2FAResponse>(
    API_CONFIG.AUTH_LOGIN_VERIFY_2FA,
    body,
    { skipAuth: true },
  )) as Login2FAResponse;

  setAccessToken(response.access_token);
  let hasCompletedOnboarding = false;
  try {
    hasCompletedOnboarding = await resolveHasCompletedOnboarding();
  } catch {
    hasCompletedOnboarding = false;
  }

  return mapAuthSession(response.access_token, response.user, {
    tokenType: response.token_type ?? 'bearer',
    hasCompletedOnboarding,
  });
}

export async function handleResendLogin2FA(tempToken: string): Promise<Login2FAResendResponse> {
  const body: Login2FAResendRequest = { temp_token: tempToken };
  return (await post<Login2FAResendRequest, Login2FAResendResponse>(
    API_CONFIG.AUTH_LOGIN_RESEND_2FA,
    body,
    { skipAuth: true },
  )) as Login2FAResendResponse;
}

export async function handleVerifyAuthToken(): Promise<UserResponse> {
  const response = await get<VerifyAuthWireResponse | UserResponse>(API_CONFIG.AUTH_VERIFY);
  if (response && typeof response === 'object' && 'id' in response && 'email' in response && 'is_admin' in response) {
    return response as UserResponse;
  }
  if (response && typeof response === 'object' && 'user' in response) {
    const wire = response as VerifyAuthWireResponse;
    if (wire.user) {
      return toUserResponse(wire.user);
    }
  }
  throw new Error('errors.auth.invalidVerificationResponse');
}

/**
 * Expo web SSO: cookie was set by backend redirect; hydrate AuthSession via verify + profile.
 * Stores COOKIE_SESSION_TOKEN marker so axios relies on withCredentials.
 */
export async function handleHydrateCookieSession(): Promise<AuthSession> {
  const verifyBody = await get<VerifyAuthWireResponse | UserResponse>(API_CONFIG.AUTH_VERIFY);
  let baseUser: UserResponse | null = null;

  if (verifyBody && typeof verifyBody === 'object' && 'id' in verifyBody && 'email' in verifyBody) {
    baseUser = verifyBody as UserResponse;
  } else if (verifyBody && typeof verifyBody === 'object' && 'user' in verifyBody) {
    const wire = verifyBody as VerifyAuthWireResponse;
    if (wire.user) {
      baseUser = toUserResponse(wire.user);
    }
  }

  if (!baseUser) {
    throw new Error('errors.auth.ssoHydrateFailed');
  }

  // Verify wire is `{ id, username, email }` only — no `is_admin`. Profile is required
  // so org-admin gating (`session.user.isAdmin`) is not silently set to false.
  try {
    const profile = await handleGetUserProfile();
    baseUser = {
      ...baseUser,
      username: profile.username || baseUser.username,
      email: profile.email || baseUser.email,
      is_active: profile.is_active,
      is_admin: profile.is_admin,
      created_at: profile.created_at,
      last_login: profile.last_login,
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error('errors.auth.ssoHydrateFailed');
  }

  setAccessToken(COOKIE_SESSION_TOKEN);

  let hasCompletedOnboarding = false;
  try {
    hasCompletedOnboarding = await resolveHasCompletedOnboarding();
  } catch {
    hasCompletedOnboarding = false;
  }

  return mapAuthSession(COOKIE_SESSION_TOKEN, baseUser, {
    tokenType: 'cookie',
    hasCompletedOnboarding,
  });
}

export async function handleRegister(payload: SignUpPayload): Promise<SignUpResult> {
  const body: UserCreateRequest = {
    username: payload.fullName.trim(),
    email: payload.email.trim().toLowerCase(),
    password: payload.password,
  };

  const response = (await post<UserCreateRequest, RegistrationPendingResponse>(
    API_CONFIG.AUTH_REGISTER,
    body,
    { skipAuth: true },
  )) as RegistrationPendingResponse;

  return {
    kind: 'pending_verification',
    email: response.email,
    message:
      response.message ??
      'Account created. Please check your email to verify your address before signing in.',
    status: response.status,
  };
}

export async function handleVerifyEmail(payload: VerifyEmailPayload) {
  const body: VerifyEmailRequest = {
    email: payload.email.trim().toLowerCase(),
    code: payload.code.trim(),
  };

  const response = (await post<VerifyEmailRequest, VerifyEmailResponse>(
    API_CONFIG.AUTH_VERIFY_EMAIL,
    body,
    { skipAuth: true },
  )) as VerifyEmailResponse;

  if (!response.access_token || !response.user) {
    throw new Error(response.message ?? 'errors.auth.emailVerificationFailed');
  }

  return mapAuthSession(response.access_token, response.user, {
    tokenType: response.token_type ?? 'bearer',
    hasCompletedOnboarding: false,
  });
}

export async function handleResendVerification(
  payload: ResendVerificationPayload,
): Promise<ResendVerificationResponse> {
  const body: ResendVerificationRequest = {
    email: payload.email.trim().toLowerCase(),
  };

  return (await post<ResendVerificationRequest, ResendVerificationResponse>(
    API_CONFIG.AUTH_RESEND_VERIFICATION,
    body,
    { skipAuth: true },
  )) as ResendVerificationResponse;
}

export async function handleLogout(): Promise<void> {
  try {
    await post(API_CONFIG.AUTH_LOGOUT);
  } catch {
    // Local session is cleared by the caller even when logout API fails.
  }
}
