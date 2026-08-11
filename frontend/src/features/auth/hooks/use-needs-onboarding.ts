import { useSession } from '@/features/auth/providers/session-provider';

/** True when the user is signed in but must finish onboarding before using the app. */
export function useNeedsOnboarding(): boolean {
  const { isAuthenticated, session } = useSession();
  return isAuthenticated && session != null && !session.user.hasCompletedOnboarding;
}
