import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

const POLL_INTERVAL_MS = 30_000;

export type PlatformOnlineStatus = 'online' | 'offline' | 'checking';

/**
 * Sidebar online badge — uses `/api/v1/health/ping` (no DB).
 * Do not call `/api/v1/health` or `/api/v1/system-health` here: those probe Postgres/ES
 * and under load time out, which falsely trips the global overlay.
 */
export function usePlatformOnlineStatus() {
  const { isReady } = useAuthenticatedBootstrap();
  const [status, setStatus] = useState<PlatformOnlineStatus>('checking');

  const refresh = useCallback(async () => {
    try {
      await get(API_CONFIG.HEALTH_PING, {
        skipReachability: true,
        timeout: 4_000,
      });
      setStatus('online');
    } catch {
      setStatus('offline');
    }
  }, []);

  useEffect(() => {
    if (!isReady) {
      setStatus('checking');
      return;
    }

    void refresh();
    const intervalId = setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isReady, refresh]);

  return { status, refresh };
}
