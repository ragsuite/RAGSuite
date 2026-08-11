import { useCallback, useEffect, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchSystemHealth } from '@/features/system-health/services/systemHealth.service';
import type { SystemHealthSnapshot } from '@/features/system-health/types/systemHealth.types';
import { useTranslation } from '@/i18n';
import { useToastRef } from '@/shared/toast/use-toast-ref';

const DEFAULT_ERROR_KEY = 'system-health.error.unknown';

type State = {
  data: SystemHealthSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
};

export function useSystemHealth() {
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const { isReady } = useAuthenticatedBootstrap();
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    refreshing: false,
    error: null,
  });

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        toastRef.current({
          description: t('system-health.toast.refreshing.description'),
        });
      }

      setState((prev) => ({
        ...prev,
        loading: mode === 'initial' && prev.data == null,
        refreshing: mode === 'refresh' || (mode === 'initial' && prev.data != null),
        error: null,
      }));

      try {
        const response = await fetchSystemHealth();
        setState({
          data: response,
          loading: false,
          refreshing: false,
          error: null,
        });
        if (mode === 'refresh') {
          toastRef.current({
            description: t('system-health.toast.refreshed.description'),
            variant: 'success',
          });
        }
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : t(DEFAULT_ERROR_KEY);
        setState((prev) => ({
          ...prev,
          loading: false,
          refreshing: false,
          error: message,
        }));
        if (mode === 'refresh') {
          toastRef.current({ description: message, variant: 'error' });
        }
      }
    },
    [t, toastRef],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void load('initial');
  }, [isReady, load]);

  return {
    data: state.data,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    isEmpty: (state.data?.services.length ?? 0) === 0 && !state.loading && !state.error,
    fetchSystemHealth: () => load('initial'),
    refresh: () => load('refresh'),
    reload: () => load('initial'),
  };
}
