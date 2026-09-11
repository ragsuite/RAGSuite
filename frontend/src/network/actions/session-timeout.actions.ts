import { API_CONFIG } from '@/network/apiUrl';
import { get, post, put } from '@/network/request';
import type { AuthSession } from '@/features/auth/auth.types';
import type { UserResponse } from '@/features/auth/types/auth.api.types';
import { mapAuthSession } from '@/features/auth/utils/auth-mappers';
import { setAccessToken } from '@/network/auth-session';

export type SessionTimeoutResponse = {
  session_timeout_minutes: number;
  session_timeout_enabled: boolean;
  default_minutes: number;
  min_minutes: number;
  max_minutes: number;
  source: 'org' | 'env' | string;
};

export type SessionTimeoutUpdatePayload = {
  session_timeout_enabled?: boolean;
  session_timeout_minutes?: number;
};

export type SessionRefreshWire = {
  access_token: string;
  token_type?: string;
  expires_at: string;
  user: UserResponse;
};

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function handleGetSessionTimeout(): Promise<SessionTimeoutResponse> {
  const body = await get<SessionTimeoutResponse>(API_CONFIG.SETTINGS_SESSION_TIMEOUT);
  return unwrapBody<SessionTimeoutResponse>(body);
}

export async function handleUpdateSessionTimeout(
  payload: SessionTimeoutUpdatePayload,
): Promise<SessionTimeoutResponse> {
  const body = await put<SessionTimeoutUpdatePayload, SessionTimeoutResponse>(
    API_CONFIG.SETTINGS_SESSION_TIMEOUT,
    payload,
  );
  return unwrapBody<SessionTimeoutResponse>(body);
}

export async function handleRefreshSession(options?: {
  hasCompletedOnboarding?: boolean;
}): Promise<AuthSession> {
  const body = await post<undefined, SessionRefreshWire>(API_CONFIG.SETTINGS_REFRESH_SESSION);
  const wire = unwrapBody<SessionRefreshWire>(body);
  setAccessToken(wire.access_token);
  return mapAuthSession(wire.access_token, wire.user, {
    tokenType: wire.token_type ?? 'bearer',
    hasCompletedOnboarding: options?.hasCompletedOnboarding ?? true,
    expiresAt: wire.expires_at,
  });
}
