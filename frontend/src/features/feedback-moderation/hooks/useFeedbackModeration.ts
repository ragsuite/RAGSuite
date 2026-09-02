import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import {
  fetchFeedbackList,
  fetchFeedbackSummary,
} from '@/features/feedback-moderation/services/feedback-moderation.service';
import type {
  FeedbackListItem,
  FeedbackSummary,
  FeedbackVoteFilter,
} from '@/features/feedback-moderation/types/feedback-moderation.types';
import { FEEDBACK_MODERATION_PAGE_SIZE } from '@/features/feedback-moderation/utils/feedback-options';
import { useTranslation } from '@/i18n';
import type { PageSizeOption } from '@/shared/constants/pagination';
import { useOffsetPagination } from '@/shared/hooks/use-offset-pagination';

const SEARCH_DEBOUNCE_MS = 350;

export type ListPaginationMode = 'append' | 'paged';

type UseFeedbackModerationOptions = {
  paginationMode?: ListPaginationMode;
};

export function useFeedbackModeration(options?: UseFeedbackModerationOptions) {
  const paginationMode = options?.paginationMode ?? 'append';
  const isPaged = paginationMode === 'paged';

  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const { t } = useTranslation();
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [items, setItems] = useState<FeedbackListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [voteFilter, setVoteFilter] = useState<FeedbackVoteFilter>('all');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const filterResetKey = useMemo(
    () => JSON.stringify({ debouncedQuery, voteFilter, activeProjectId }),
    [activeProjectId, debouncedQuery, voteFilter],
  );

  const { page, pageSize, offset, totalPages, setPage, setPageSize } = useOffsetPagination({
    defaultPageSize: FEEDBACK_MODERATION_PAGE_SIZE as PageSizeOption,
    storageKey: isPaged ? 'feedback-moderation' : undefined,
    total,
    filterResetKey,
  });

  const appendListParams = useMemo(
    () => ({
      limit: FEEDBACK_MODERATION_PAGE_SIZE,
      query: debouncedQuery || undefined,
      voteFilter,
      projectId: activeProjectId,
    }),
    [activeProjectId, debouncedQuery, voteFilter],
  );

  const pagedListParams = useMemo(
    () => ({
      limit: pageSize,
      query: debouncedQuery || undefined,
      voteFilter,
      projectId: activeProjectId,
    }),
    [activeProjectId, debouncedQuery, pageSize, voteFilter],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, listRes] = await Promise.all([
        fetchFeedbackSummary(),
        fetchFeedbackList({ ...appendListParams, offset: 0 }),
      ]);
      setSummary(summaryRes);
      setItems(listRes.items);
      setTotal(listRes.total);
      setHasMore(listRes.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [appendListParams, t]);

  const loadPaged = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, listRes] = await Promise.all([
        fetchFeedbackSummary(),
        fetchFeedbackList({ ...pagedListParams, offset }),
      ]);
      setSummary(summaryRes);
      setItems(listRes.items);
      setTotal(listRes.total);
      setHasMore(false);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, pagedListParams, t]);

  useEffect(() => {
    if (!isReady) return;
    if (isPaged) {
      void loadPaged();
      return;
    }
    void loadInitial();
  }, [isPaged, isReady, loadInitial, loadPaged]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      if (isPaged) {
        const [summaryRes, listRes] = await Promise.all([
          fetchFeedbackSummary(),
          fetchFeedbackList({ ...pagedListParams, offset }),
        ]);
        setSummary(summaryRes);
        setItems(listRes.items);
        setTotal(listRes.total);
      } else {
        const [summaryRes, listRes] = await Promise.all([
          fetchFeedbackSummary(),
          fetchFeedbackList({ ...appendListParams, offset: 0 }),
        ]);
        setSummary(summaryRes);
        setItems(listRes.items);
        setTotal(listRes.total);
        setHasMore(listRes.hasMore);
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [appendListParams, isPaged, offset, pagedListParams, t]);

  const loadMore = useCallback(async () => {
    if (isPaged || loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const listRes = await fetchFeedbackList({ ...appendListParams, offset: items.length });
      setItems((prev) => [...prev, ...listRes.items]);
      setTotal(listRes.total);
      setHasMore(listRes.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [appendListParams, hasMore, isPaged, items.length, loading, loadingMore, t]);

  const emptyLabel = t('feedbackModeration.empty');

  return {
    summary,
    items,
    total,
    hasMore,
    query,
    setQuery,
    voteFilter,
    setVoteFilter,
    loading,
    loadingMore,
    refreshing,
    error,
    emptyLabel,
    reload: () => void (isPaged ? loadPaged() : loadInitial()),
    refresh: () => void refresh(),
    loadMore: () => void loadMore(),
    patchListItem: (id: string, patch: Partial<FeedbackListItem>) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    refreshSummary: async () => {
      const next = await fetchFeedbackSummary();
      setSummary(next);
    },
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    paginationMode,
  };
}
