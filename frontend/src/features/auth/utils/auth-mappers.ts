import type { AuthSession, AuthUser } from '@/features/auth/auth.types';
import type { UserResponse } from '@/features/auth/types/auth.api.types';

export function mapUserResponse(user: UserResponse, hasCompletedOnboarding = true): AuthUser {
  return {
    id: String(user.id),
    fullName: user.username,
    email: user.email,
    isActive: user.is_active,
    isAdmin: user.is_admin,
    hasCompletedOnboarding,
  };
}

export function mapAuthSession(
  accessToken: string,
  user: UserResponse,
  options?: { tokenType?: string; hasCompletedOnboarding?: boolean },
): AuthSession {
  return {
    accessToken,
    tokenType: options?.tokenType ?? 'bearer',
    user: mapUserResponse(user, options?.hasCompletedOnboarding ?? true),
  };
}
