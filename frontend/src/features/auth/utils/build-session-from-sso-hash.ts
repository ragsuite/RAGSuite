import type { AuthSession } from '@/features/auth/auth.types';
import { mapAuthSession } from '@/features/auth/utils/auth-mappers';
import type { UserResponse } from '@/features/auth/types/auth.api.types';

/** Build a session from SSO redirect hash fields when verify/profile are unavailable. */
export function buildSessionFromSsoHash(
  accessToken: string,
  params: URLSearchParams,
  options?: { hasCompletedOnboarding?: boolean },
): AuthSession | null {
  const userId = params.get('user_id');
  const username = params.get('username');
  const email = params.get('email');
  if (!userId || !username || !email) {
    return null;
  }

  const user: UserResponse = {
    id: Number.parseInt(userId, 10),
    username,
    email,
    is_active: params.get('is_active') !== '0',
    is_admin: params.get('is_admin') === '1',
    created_at: new Date().toISOString(),
    last_login: null,
  };

  const redirectPath = params.get('redirect_path');
  const hasCompletedOnboarding =
    options?.hasCompletedOnboarding ??
    (redirectPath ? redirectPath !== '/onboarding' : true);

  return mapAuthSession(accessToken, user, { hasCompletedOnboarding });
}
