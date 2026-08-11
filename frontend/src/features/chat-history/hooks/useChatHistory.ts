import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { fetchChatHistoryQueries } from '@/features/chat-history/services/chat-history.service';
import type { ChatQueryListItem } from '@/features/chat-history/types/chat-history.types';
import { CHAT_HISTORY_PAGE_SIZE } from '@/features/chat-history/utils/chat-history-options';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useTranslation } from '@/i18n';

const SEARCH_DEBOUNCE_MS = 350;
const DEFAULT_ERROR_KEY = 'history.error.loadDescription';

export function useChatHistory() {
  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [items, setItems] = useState<ChatQueryListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const queryParams = useMemo(
    () => ({
      limit: CHAT_HISTORY_PAGE_SIZE,
      q: debouncedQuery || undefined,
      projectId: activeProjectId ?? undefined,
    }),
    [debouncedQuery, activeProjectId],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({ ...queryParams, offset: 0 });
      setItems(response.items);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [queryParams, t]);

  useEffect(() => {
    setItems([]);
    setTotal(0);
    setHasMore(false);
  }, [activeProjectId]);

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void loadInitial();
  }, [isReady, loadInitial]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({ ...queryParams, offset: 0 });
      setItems(response.items);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [queryParams, t]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await fetchChatHistoryQueries({
        ...queryParams,
        offset: items.length,
      });
      setItems((current) => [...current, ...response.items]);
      setTotal(response.total);
      setHasMore(response.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t(DEFAULT_ERROR_KEY);
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items.length, loading, loadingMore, queryParams, t]);

  const emptyLabel = t('history.empty');

  return {
    items,
    total,
    query,
    setQuery,
    loading,
    loadingMore,
    refreshing,
    error,
    reload: loadInitial,
    refresh,
    loadMore,
    hasMore,
    emptyLabel,
  };
}
