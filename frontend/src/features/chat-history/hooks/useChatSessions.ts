import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchHistorySessions } from '@/features/chat-history/services/chat-sessions.service';
import type {
  HistoryKind,
  HistorySessionSummaryItem,
} from '@/features/chat-history/types/chat-history.types';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import {
  listTimeRangeToDateFrom,
  type ListTimeRange,
} from '@/shared/utils/list-time-range';

const SESSION_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

type UseChatSessionsOptions = {
  kind?: HistoryKind;
  query: string;
  timeRange: ListTimeRange;
};

export function useChatSessions(options: UseChatSessionsOptions) {
  const kind = options.kind ?? 'chatbot';
  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const { t } = useTranslation();
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<HistorySessionSummaryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(options.query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [options.query]);

  const dateFrom = useMemo(
    () => listTimeRangeToDateFrom(options.timeRange),
    [options.timeRange],
  );

  const filterResetKey = useMemo(
    () => JSON.stringify({ debouncedQuery, activeProjectId, kind, dateFrom }),
    [activeProjectId, dateFrom, debouncedQuery, kind],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchHistorySessions({
        limit: SESSION_PAGE_SIZE,
        offset: 0,
        q: debouncedQuery || undefined,
        projectId: activeProjectId ?? undefined,
        dateFrom,
        kind,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : t('history.error.loadDescription');
      setError(message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, dateFrom, debouncedQuery, kind, t]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
  }, [activeProjectId, filterResetKey]);

  useEffect(() => {
    if (!isReady) return;
    void load();
  }, [filterResetKey, isReady, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const emptyLabel =
    kind === 'search' ? t('history.sessions.emptySearch') : t('history.sessions.empty');

  return {
    items,
    total,
    loading,
    refreshing,
    error,
    reload: load,
    refresh,
    emptyLabel,
  };
}
