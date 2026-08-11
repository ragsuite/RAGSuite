import { useCallback, useEffect, useState } from 'react';

import type { HomeOverview } from '@/features/home/home.types';
import { getHomeOverview } from '@/features/home/services/home.api';

type State = {
  data: HomeOverview | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

const DEFAULT_ERROR = 'Unable to load overview right now. Please try again.';

export function useHomeOverview() {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    setState((prev) => ({
      ...prev,
      loading: mode === 'initial',
      refreshing: mode === 'refresh',
      error: null,
    }));

    try {
      const response = await getHomeOverview();
      setState({
        data: response,
        loading: false,
        refreshing: false,
        error: null,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        refreshing: false,
        error: DEFAULT_ERROR,
      }));
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  return {
    ...state,
    reload: () => load('initial'),
    refresh: () => load('refresh'),
  };
}
