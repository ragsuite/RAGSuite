import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchCrawlEmbeddingTargetOptions } from '@/features/crawl/services/crawl.service';
import type {
  CrawlEmbeddingTargetOptions,
  CrawlProviderIngestTarget,
} from '@/features/crawl/types/crawl.types';
import { providerOptionFor } from '@/features/crawl/utils/crawl-provider-target';
import {
  resolveDocumentEmbeddingMessages,
  type SourceEmbeddingMessages,
} from '@/features/crawl/utils/crawl-source-embedding-form';
import { useTranslation } from '@/i18n';

type Params = {
  visible: boolean;
  /** Provider already saved on the item (edit); null/undefined for new or legacy items. */
  stored?: CrawlProviderIngestTarget | null;
  /** Preselect the default provider when nothing is stored (create forms). */
  preselectDefault: boolean;
};

export type EmbeddingProviderSelection = {
  options: CrawlEmbeddingTargetOptions | null;
  loading: boolean;
  failed: boolean;
  selected: CrawlProviderIngestTarget | undefined;
  messages: SourceEmbeddingMessages;
  select: (provider: CrawlProviderIngestTarget) => void;
};

/** Model Configuration provider picker state for documents, Text and Q&A forms. */
export function useEmbeddingProviderSelection({
  visible,
  stored,
  preselectDefault,
}: Params): EmbeddingProviderSelection {
  const { t } = useTranslation();
  const [options, setOptions] = useState<CrawlEmbeddingTargetOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<CrawlProviderIngestTarget | undefined>(undefined);
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      touchedRef.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    void fetchCrawlEmbeddingTargetOptions()
      .then((next) => {
        if (cancelled) return;
        setOptions(next);
        if (!next) setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || touchedRef.current) return;
    const storedProvider = providerOptionFor(stored, options)?.provider;
    const fallback = preselectDefault && !stored ? options?.default_provider ?? undefined : undefined;
    setSelected(storedProvider ?? fallback);
  }, [visible, stored, options, preselectDefault]);

  const select = useCallback((provider: CrawlProviderIngestTarget) => {
    touchedRef.current = true;
    setSelected(provider);
  }, []);

  const messages = useMemo(
    () => resolveDocumentEmbeddingMessages({ selected, stored, options, t }),
    [options, selected, stored, t],
  );

  return { options, loading, failed, selected, messages, select };
}
