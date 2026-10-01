import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';
import type { HistorySessionSummaryItem } from '@/features/chat-history/types/chat-history.types';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';
import { handleGetFeedbackModerationSessionsSummary } from '@/network/actions/feedback-moderation.actions';
import {
  listTimeRangeToDateFrom,
  type ListTimeRange,
} from '@/shared/utils/list-time-range';

const SESSION_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 350;

type UseFeedbackSessionsOptions = {
  kind?: HistoryKind;
  query: string;
  timeRange: ListTimeRange;
};

export function useFeedbackSessions(options: UseFeedbackSessionsOptions) {
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
      const response = await handleGetFeedbackModerationSessionsSummary({
        kind,
        limit: SESSION_PAGE_SIZE,
        offset: 0,
        q: debouncedQuery || undefined,
        dateFrom,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (err) {
      const message =
        err instanceof Error && err.message ? err.message : t('common.error');
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

  return {
    items,
    total,
    loading,
    refreshing,
    error,
    reload: load,
    refresh,
    emptyLabel: t('feedbackModeration.emptyState.title'),
  };
}
