import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { handleGetSystemFooter } from '@/network/actions/system-footer.actions';

type SystemFooterContextValue = {
  /**
   * When false, authenticated web app shell footer is hidden.
   * Stays false until the server setting is resolved so a disabled footer never flashes.
   */
  showSystemFooter: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SystemFooterContext = createContext<SystemFooterContextValue | null>(null);

/** Fallback only after a failed fetch (prefer showing on CE if the API is unreachable). */
const FALLBACK_SHOW_ON_ERROR = true;

export function SystemFooterProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSession();
  const [showSystemFooter, setShowSystemFooterState] = useState(false);
  const [resolved, setResolved] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setShowSystemFooterState(false);
      setResolved(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await handleGetSystemFooter();
      setShowSystemFooterState(next.show_system_footer !== false);
    } catch {
      setShowSystemFooterState(FALLBACK_SHOW_ON_ERROR);
    } finally {
      setResolved(true);
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      // Never expose true until the first authenticated fetch finishes.
      showSystemFooter: resolved && showSystemFooter,
      loading,
      refresh,
    }),
    [showSystemFooter, resolved, loading, refresh],
  );

  return <SystemFooterContext.Provider value={value}>{children}</SystemFooterContext.Provider>;
}

export function useSystemFooter(): SystemFooterContextValue {
  const ctx = useContext(SystemFooterContext);
  if (!ctx) {
    return {
      showSystemFooter: false,
      loading: false,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
