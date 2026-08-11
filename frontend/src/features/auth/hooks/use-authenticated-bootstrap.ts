import { useSession } from '@/features/auth/providers/session-provider';

export function useAuthenticatedBootstrap() {
  const { isBooting, isAuthenticated } = useSession();

  return {
    isBooting,
    isAuthenticated,
    isReady: !isBooting && isAuthenticated,
  };
}
