import { useCallback, useEffect, useRef, useState } from 'react';

import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import {
  fetchModelConfiguration,
  fetchProviderConfig,
  listAzureDeployments as listAzureDeploymentsRequest,
  removeProviderConfig,
  saveProviderConfig,
  testProviderConnection,
} from '@/features/model-configuration/services/model-configuration.service';
import type {
  AzureDeploymentsListPayload,
  AzureDeploymentsListResult,
  ModelConfigurationBundle,
  ModelProviderKey,
  ProviderConfig,
  ProviderConfigSavePayload,
  ProviderConnectionResult,
  ProviderTestPayload,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  mapProviderConfig,
  resolveAzureDeploymentsRefreshMessage,
} from '@/features/model-configuration/utils/model-configuration.mappers';
import {
  formatConnectionTestError,
  resolveConnectionTestMessage,
} from '@/features/search-config/utils/search-model-settings';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';
import { useStableToast } from '@/shared/toast/use-toast-ref';

function errorMessage(
  error: unknown,
  fallback: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  const localized = resolveConnectionTestMessage(formatConnectionTestError(error.message), t);
  return localized || fallback;
}

function withProviderConfig(
  bundle: ModelConfigurationBundle,
  provider: ModelProviderKey,
  patch: (current: ProviderConfig) => ProviderConfig,
): ModelConfigurationBundle {
  const providers = bundle.providers.map((entry) =>
    entry.key === provider ? { ...entry, config: patch(entry.config) } : entry,
  );
  return { providers, configuredCount: providers.filter((p) => p.config.configured).length };
}

export function useModelConfiguration() {
  const { t } = useTranslation();
  const toast = useStableToast();
  const { activeProjectId, loading: projectsLoading } = useActiveProject();
  const awaitingProject = !activeProjectId && projectsLoading;
  const [bundle, setBundle] = useState<ModelConfigurationBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingProvider, setSavingProvider] = useState<ModelProviderKey | null>(null);
  const [removingProvider, setRemovingProvider] = useState<ModelProviderKey | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    if (!activeProjectId) {
      setBundle(null);
      setLoading(awaitingProject);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchModelConfiguration(activeProjectId);
      if (gen === loadGenRef.current) setBundle(next);
    } catch (err) {
      if (gen === loadGenRef.current) {
        setError(errorMessage(err, t('modelConfiguration.loadError'), t));
      }
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [activeProjectId, awaitingProject, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveProvider = useCallback(
    async (provider: ModelProviderKey, payload: ProviderConfigSavePayload): Promise<boolean> => {
      if (!activeProjectId) return false;
      setSavingProvider(provider);
      try {
        const saved = await saveProviderConfig(activeProjectId, provider, payload);
        setBundle((prev) => (prev ? withProviderConfig(prev, provider, () => saved) : prev));
        toast({ description: t('modelConfiguration.toast.saved'), variant: 'success' });
        return true;
      } catch (err) {
        toast({ description: errorMessage(err, t('modelConfiguration.toast.saveFailed'), t), variant: 'error' });
        return false;
      } finally {
        setSavingProvider(null);
      }
    },
    [activeProjectId, t, toast],
  );

  const testProvider = useCallback(
    async (provider: ModelProviderKey, payload: ProviderTestPayload): Promise<ProviderConnectionResult> => {
      if (!activeProjectId) return { ok: false, message: t('modelConfiguration.noProject') };
      try {
        const result = await testProviderConnection(activeProjectId, provider, payload);
        if (!payload.api_key) {
          const fresh = await fetchProviderConfig(activeProjectId, provider).catch(() => null);
          setBundle((prev) =>
            prev
              ? withProviderConfig(prev, provider, (current) =>
                  fresh ?? {
                    ...current,
                    lastTestStatus: result.ok ? 'success' : 'failed',
                    lastTestedAt: new Date().toISOString(),
                  },
                )
              : prev,
          );
        }
        return {
          ...result,
          message: resolveConnectionTestMessage(result.message, t),
        };
      } catch (err) {
        const raw = resolveAppErrorMessage(err, t, 'models.apiKey.test.connectionFailed');
        return {
          ok: false,
          message: resolveConnectionTestMessage(formatConnectionTestError(raw), t),
        };
      }
    },
    [activeProjectId, t],
  );

  const removeProvider = useCallback(
    async (provider: ModelProviderKey): Promise<boolean> => {
      if (!activeProjectId) return false;
      setRemovingProvider(provider);
      try {
        await removeProviderConfig(activeProjectId, provider);
        setBundle((prev) => (prev ? withProviderConfig(prev, provider, () => mapProviderConfig(undefined, provider)) : prev));
        toast({ description: t('modelConfiguration.toast.removed'), variant: 'success' });
        return true;
      } catch (err) {
        toast({ description: errorMessage(err, t('modelConfiguration.toast.removeFailed'), t), variant: 'error' });
        return false;
      } finally {
        setRemovingProvider(null);
      }
    },
    [activeProjectId, t, toast],
  );

  const listAzureDeployments = useCallback(
    async (payload: AzureDeploymentsListPayload): Promise<AzureDeploymentsListResult> => {
      if (!activeProjectId) {
        return {
          chat: [],
          embedding: [],
          error: t('modelConfiguration.noProject'),
        };
      }
      try {
        const result = await listAzureDeploymentsRequest(activeProjectId, payload);
        return {
          ...result,
          error: result.error
            ? resolveAzureDeploymentsRefreshMessage(result.error, t)
            : null,
        };
      } catch (err) {
        const raw = resolveAppErrorMessage(err, t, 'modelConfiguration.deployments.refresh.failed');
        return {
          chat: [],
          embedding: [],
          error: resolveAzureDeploymentsRefreshMessage(raw, t),
        };
      }
    },
    [activeProjectId, t],
  );

  return {
    bundle,
    loading,
    error,
    hasProject: Boolean(activeProjectId),
    savingProvider,
    removingProvider,
    reload: load,
    saveProvider,
    testProvider,
    removeProvider,
    listAzureDeployments,
  };
}

export type ModelConfigurationController = ReturnType<typeof useModelConfiguration>;
