import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { handleGetSystemFooter } from '@/network/actions/system-footer.actions';

type SystemFooterContextValue = {
  /** When false, authenticated web app shell footer is hidden. Defaults true. */
  showSystemFooter: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SystemFooterContext = createContext<SystemFooterContextValue | null>(null);

const DEFAULT_SHOW = true;

export function SystemFooterProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useSession();
  const [showSystemFooter, setShowSystemFooterState] = useState(DEFAULT_SHOW);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setShowSystemFooterState(DEFAULT_SHOW);
      return;
    }
    setLoading(true);
    try {
      const next = await handleGetSystemFooter();
      setShowSystemFooterState(next.show_system_footer !== false);
    } catch {
      setShowSystemFooterState(DEFAULT_SHOW);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      showSystemFooter,
      loading,
      refresh,
    }),
    [showSystemFooter, loading, refresh],
  );

  return <SystemFooterContext.Provider value={value}>{children}</SystemFooterContext.Provider>;
}

export function useSystemFooter(): SystemFooterContextValue {
  const ctx = useContext(SystemFooterContext);
  if (!ctx) {
    return {
      showSystemFooter: DEFAULT_SHOW,
      loading: false,
      refresh: async () => undefined,
    };
  }
  return ctx;
}
