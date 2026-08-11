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

const SEARCH_DEBOUNCE_MS = 350;

export function useFeedbackModeration() {
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

  const listParams = useMemo(
    () => ({
      limit: FEEDBACK_MODERATION_PAGE_SIZE,
      query: debouncedQuery || undefined,
      voteFilter,
      projectId: activeProjectId,
    }),
    [activeProjectId, debouncedQuery, voteFilter],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, listRes] = await Promise.all([
        fetchFeedbackSummary(),
        fetchFeedbackList({ ...listParams, offset: 0 }),
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
  }, [listParams, t]);

  useEffect(() => {
    if (!isReady) return;
    void loadInitial();
  }, [isReady, loadInitial]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [summaryRes, listRes] = await Promise.all([
        fetchFeedbackSummary(),
        fetchFeedbackList({ ...listParams, offset: 0 }),
      ]);
      setSummary(summaryRes);
      setItems(listRes.items);
      setTotal(listRes.total);
      setHasMore(listRes.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
    } finally {
      setRefreshing(false);
    }
  }, [listParams, t]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const listRes = await fetchFeedbackList({ ...listParams, offset: items.length });
      setItems((prev) => [...prev, ...listRes.items]);
      setTotal(listRes.total);
      setHasMore(listRes.hasMore);
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : t('common.error');
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, items.length, listParams, loading, loadingMore, t]);

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
    reload: () => void loadInitial(),
    refresh: () => void refresh(),
    loadMore: () => void loadMore(),
    patchListItem: (id: string, patch: Partial<FeedbackListItem>) => {
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    refreshSummary: async () => {
      const next = await fetchFeedbackSummary();
      setSummary(next);
    },
  };
}
