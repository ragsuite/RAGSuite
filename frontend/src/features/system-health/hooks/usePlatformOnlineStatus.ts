import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchSystemHealth } from '@/features/system-health/services/systemHealth.service';

const POLL_INTERVAL_MS = 30_000;

export type PlatformOnlineStatus = 'online' | 'offline' | 'checking';

export function usePlatformOnlineStatus() {
  const { isReady } = useAuthenticatedBootstrap();
  const [status, setStatus] = useState<PlatformOnlineStatus>('checking');

  const refresh = useCallback(async () => {
    try {
      const snapshot = await fetchSystemHealth();
      setStatus(snapshot.overallStatus === 'down' ? 'offline' : 'online');
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
