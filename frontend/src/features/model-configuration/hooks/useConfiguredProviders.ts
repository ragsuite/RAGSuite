import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import type { ProviderCatalogEntry } from '@/features/model-configuration/types/model-configuration.types';
import { mapModelConfigurationResponse } from '@/features/model-configuration/utils/model-configuration.mappers';
import { useTranslation } from '@/i18n';
import { handleListModelProviders } from '@/network/actions/model-configuration.actions';

/** Providers configured in Model Configuration for the active project (no live model probes). */
export function useConfiguredProviders() {
  const { t } = useTranslation();
  const { activeProjectId, loading: projectsLoading } = useActiveProject();
  const awaitingProject = !activeProjectId && projectsLoading;
  const [providers, setProviders] = useState<ProviderCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadGenRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++loadGenRef.current;
    if (!activeProjectId) {
      setProviders([]);
      setLoading(awaitingProject);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bundle = mapModelConfigurationResponse(await handleListModelProviders(activeProjectId, { live: false }));
      if (gen === loadGenRef.current) setProviders(bundle.providers);
    } catch (err) {
      if (gen === loadGenRef.current) {
        setError(err instanceof Error && err.message ? err.message : t('modelConfiguration.loadError'));
      }
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [activeProjectId, awaitingProject, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const configured = useMemo(() => providers.filter((p) => p.config.configured), [providers]);

  return { all: providers, configured, loading, error, reload: load };
}
