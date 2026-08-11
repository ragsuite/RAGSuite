import type { Href } from 'expo-router';

import type { AuthSession } from '@/features/auth/auth.types';

/** Map backend post-auth paths to Expo Router destinations. */
export function resolvePostAuthHref(
  session: AuthSession,
  redirectPath?: string | null,
): Href {
  const needsOnboarding =
    !session.user.hasCompletedOnboarding || redirectPath === '/onboarding';
  if (needsOnboarding) {
    return '/(app)/onboarding';
  }
  if (session.user.isAdmin || redirectPath === '/organization') {
    return '/(app)/organization-users';
  }
  return '/(app)/(tabs)';
}
