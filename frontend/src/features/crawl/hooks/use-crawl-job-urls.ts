import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CRAWL_JOB_URL_PAGE_SIZE,
  fetchCrawlJobUrlsPage,
} from '@/features/crawl/services/crawl-job-urls.service';
import type {
  CrawlJobUrlEntry,
  CrawlJobUrlKind,
  CrawlJobUrlSort,
} from '@/features/crawl/types/crawl.types';

const SEARCH_DEBOUNCE_MS = 350;

type Params = {
  jobId: string;
  kind: CrawlJobUrlKind;
  /** First page delivered with the job detail (sorted by URL). */
  initialItems: (string | CrawlJobUrlEntry)[];
  initialTotal: number;
};

type PageRequest = { offset: number; replace: boolean; query: string; sort: CrawlJobUrlSort };

function normalizeItem(item: string | CrawlJobUrlEntry): CrawlJobUrlEntry {
  return typeof item === 'string' ? { url: item } : item;
}

/** Server-paged URL list for one section of the training-run detail sheet. */
export function useCrawlJobUrls({ jobId, kind, initialItems, initialTotal }: Params) {
  const initial = useMemo(() => initialItems.map(normalizeItem), [initialItems]);
  const [items, setItems] = useState<CrawlJobUrlEntry[]>(initial);
  const [total, setTotal] = useState(Math.max(initialTotal, initial.length));
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CrawlJobUrlSort>('url');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const requestIdRef = useRef(0);
  const lastRequestRef = useRef<PageRequest | null>(null);
  /** True once the view differs from the detail's first page (load more / search / sort). */
  const divergedRef = useRef(false);
  const isFirstQueryRunRef = useRef(true);

  const runPage = useCallback(
    async (request: PageRequest) => {
      const requestId = ++requestIdRef.current;
      lastRequestRef.current = request;
      setLoading(true);
      setFailed(false);
      try {
        const page = await fetchCrawlJobUrlsPage(jobId, {
          kind,
          offset: request.offset,
          limit: CRAWL_JOB_URL_PAGE_SIZE,
          sort: request.sort,
          q: request.query,
        });
        if (requestId !== requestIdRef.current) return;
        setItems((current) => (request.replace ? page.items : [...current, ...page.items]));
        setTotal(page.total);
      } catch {
        if (requestId === requestIdRef.current) setFailed(true);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [jobId, kind],
  );

  useEffect(() => {
    if (divergedRef.current) return;
    setItems(initial);
    setTotal(Math.max(initialTotal, initial.length));
  }, [initial, initialTotal]);

  useEffect(() => {
    if (isFirstQueryRunRef.current) {
      isFirstQueryRunRef.current = false;
      return;
    }
    const trimmed = query.trim();
    if (!trimmed && sort === 'url') {
      requestIdRef.current += 1;
      divergedRef.current = false;
      lastRequestRef.current = null;
      setItems(initial);
      setTotal(Math.max(initialTotal, initial.length));
      setLoading(false);
      setFailed(false);
      return;
    }
    divergedRef.current = true;
    const timer = setTimeout(() => {
      void runPage({ offset: 0, replace: true, query: trimmed, sort });
    }, trimmed ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
    // Only query/sort changes start a new search; detail refreshes are handled above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sort]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (loading) return;
    divergedRef.current = true;
    void runPage({ offset: items.length, replace: false, query: query.trim(), sort });
  }, [items.length, loading, query, runPage, sort]);

  const retry = useCallback(() => {
    if (lastRequestRef.current) void runPage(lastRequestRef.current);
  }, [runPage]);

  const toggleSort = useCallback(() => {
    setSort((current) => (current === 'url' ? 'referrer' : 'url'));
  }, []);

  return {
    items,
    total,
    query,
    setQuery,
    sort,
    toggleSort,
    loading,
    failed,
    hasMore: items.length < total,
    isSearching: query.trim().length > 0,
    loadMore,
    retry,
  };
}
