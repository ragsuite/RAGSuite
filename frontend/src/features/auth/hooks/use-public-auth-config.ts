import { useCallback, useEffect, useState } from 'react';

import type { PublicAuthConfig } from '@/features/auth/types/public-config.types';
import { handleGetPublicAuthConfig } from '@/network/actions/public-config.actions';

const FALLBACK_CONFIG: PublicAuthConfig = {
  registrationEnabled: false,
  ssoEnabled: false,
  organizationSlug: null,
};

export function usePublicAuthConfig() {
  const [config, setConfig] = useState<PublicAuthConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const next = await handleGetPublicAuthConfig();
      setConfig(next);
      return next;
    } catch (err) {
      setConfig(FALLBACK_CONFIG);
      setError(err instanceof Error ? err.message : 'errors.auth.publicConfigFailed');
      return FALLBACK_CONFIG;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    config: config ?? FALLBACK_CONFIG,
    isLoading,
    error,
    refresh,
  };
}
