import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { API_CONFIG } from '@/network/apiUrl';
import { get } from '@/network/request';

const POLL_INTERVAL_MS = 30_000;

export type PlatformOnlineStatus = 'online' | 'offline' | 'checking';

/**
 * Sidebar online badge — uses lightweight `/api/v1/health` only.
 * Do not call full `/api/v1/system-health` here: that probes Chroma/Redis/LLMs and
 * under load times out, which falsely trips the global "Can't reach the server" overlay
 * and makes crawl Sources look empty.
 */
export function usePlatformOnlineStatus() {
  const { isReady } = useAuthenticatedBootstrap();
  const [status, setStatus] = useState<PlatformOnlineStatus>('checking');

  const refresh = useCallback(async () => {
    try {
      await get(API_CONFIG.HEALTH, {
        skipReachability: true,
        timeout: 8_000,
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
