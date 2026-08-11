import type {
  BackupCodesResponse,
  RevokeAllSessionsApiResponse,
  RevokeSessionApiResponse,
  TwoFactorSetupResponse,
  TwoFactorStatusResponse,
  UpdatePasswordApiPayload,
  UpdateProfileApiPayload,
  UserProfileResponse,
} from '@/features/profile/types/profile.api.types';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, put } from '@/network/request';

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function handleGetUserProfile(): Promise<UserProfileResponse> {
  const body = await get<UserProfileResponse>(API_CONFIG.USER_PROFILE);
  return unwrapBody<UserProfileResponse>(body);
}

export async function handleUpdateUserProfile(payload: UpdateProfileApiPayload): Promise<UserProfileResponse> {
  const body = await put<UpdateProfileApiPayload, UserProfileResponse>(API_CONFIG.USER_PROFILE, payload);
  return unwrapBody<UserProfileResponse>(body);
}

export async function handleUpdateUserPassword(payload: UpdatePasswordApiPayload): Promise<void> {
  await put<UpdatePasswordApiPayload, void>(API_CONFIG.USER_PROFILE_PASSWORD, payload);
}

export async function handleGetUserSessions(): Promise<unknown> {
  const body = await get<unknown>(API_CONFIG.USER_SESSIONS);
  return unwrapBody<unknown>(body);
}

export async function handleRevokeUserSession(sessionId: string): Promise<RevokeSessionApiResponse> {
  const body = await deleteApi<RevokeSessionApiResponse>(API_CONFIG.userSession(sessionId));
  return unwrapBody<RevokeSessionApiResponse>(body);
}

export async function handleRevokeAllOtherUserSessions(): Promise<RevokeAllSessionsApiResponse> {
  const body = await deleteApi<RevokeAllSessionsApiResponse>(API_CONFIG.USER_SESSIONS);
  return unwrapBody<RevokeAllSessionsApiResponse>(body);
}

export async function handleGetTwoFactorStatus(): Promise<TwoFactorStatusResponse> {
  const body = await get<TwoFactorStatusResponse>(API_CONFIG.USER_2FA_STATUS);
  return unwrapBody<TwoFactorStatusResponse>(body);
}

export async function handleSetupTwoFactor(): Promise<TwoFactorSetupResponse> {
  const body = await post<void, TwoFactorSetupResponse>(API_CONFIG.USER_2FA_SETUP);
  return unwrapBody<TwoFactorSetupResponse>(body);
}

export async function handleVerifyTwoFactor(code: string): Promise<TwoFactorStatusResponse> {
  const body = await post<{ code: string }, TwoFactorStatusResponse>(API_CONFIG.USER_2FA_VERIFY, { code });
  return unwrapBody<TwoFactorStatusResponse>(body);
}

export async function handleDisableTwoFactor(password: string, code?: string): Promise<TwoFactorStatusResponse> {
  const body = await post<{ password: string; code?: string }, TwoFactorStatusResponse>(
    API_CONFIG.USER_2FA_DISABLE,
    { password, code },
  );
  return unwrapBody<TwoFactorStatusResponse>(body);
}

export async function handleRegenerateBackupCodes(): Promise<BackupCodesResponse> {
  const body = await post<void, BackupCodesResponse>(API_CONFIG.USER_2FA_BACKUP_CODES);
  return unwrapBody<BackupCodesResponse>(body);
}

export async function handleEnableEmailTwoFactor(password: string): Promise<TwoFactorStatusResponse> {
  const body = await post<{ password: string }, TwoFactorStatusResponse>(API_CONFIG.USER_2FA_EMAIL_ENABLE, {
    password,
  });
  return unwrapBody<TwoFactorStatusResponse>(body);
}

export async function handleDisableEmailTwoFactor(password: string): Promise<TwoFactorStatusResponse> {
  const body = await post<{ password: string }, TwoFactorStatusResponse>(API_CONFIG.USER_2FA_EMAIL_DISABLE, {
    password,
  });
  return unwrapBody<TwoFactorStatusResponse>(body);
}
