import { type Dispatch, type MutableRefObject, type SetStateAction, useEffect } from 'react';

import { fetchDocumentsWithCoverage } from '@/features/crawl/services/crawl.service';
import type { CrawlBundle } from '@/features/crawl/types/crawl.types';
import { isDocumentTrainingActive } from '@/features/crawl/utils/crawl-document-status';
import type { EmbeddingItemCoverage } from '@/features/search-config/types/embedding.types';

/** Fast enough for a moving progress bar; documents-only so coverage is not rescanned each tick. */
export const DOCUMENT_TRAINING_POLL_MS = 4000;

type Options = {
  enabled: boolean;
  coverage: EmbeddingItemCoverage | null;
  bundleRef: MutableRefObject<CrawlBundle | null>;
  setBundle: Dispatch<SetStateAction<CrawlBundle | null>>;
  /** A document left training — reload sources + coverage so badges and banners settle. */
  onTrainingFinished: () => void;
};

function activeDocumentIds(bundle: CrawlBundle | null): Set<string> {
  return new Set((bundle?.documents ?? []).filter(isDocumentTrainingActive).map((doc) => doc.id));
}

export function useDocumentTrainingPoll({
  enabled,
  coverage,
  bundleRef,
  setBundle,
  onTrainingFinished,
}: Options): void {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const tick = async () => {
      const before = activeDocumentIds(bundleRef.current);
      try {
        const documents = await fetchDocumentsWithCoverage(coverage);
        if (cancelled) return;
        const stillActive = new Set(documents.filter(isDocumentTrainingActive).map((doc) => doc.id));
        setBundle((prev) => (prev ? { ...prev, documents } : prev));
        if ([...before].some((id) => !stillActive.has(id))) onTrainingFinished();
      } catch {
        // Next tick retries; a failed poll must not clear the list.
      }
    };
    const intervalId = setInterval(() => void tick(), DOCUMENT_TRAINING_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [enabled, coverage, bundleRef, setBundle, onTrainingFinished]);
}
