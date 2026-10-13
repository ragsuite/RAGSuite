import { useCallback, type Dispatch, type SetStateAction } from 'react';

import { setDocumentUseInAnswers, setSourceUseInAnswers } from '@/features/crawl/services/crawl.service';
import type { CrawlBundle } from '@/features/crawl/types/crawl.types';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';

type Notify = (message: string, type?: 'success' | 'error') => void;

/** "Use in answers" saves for crawl sources and for Document / Text / Q&A sources. */
export function useAnswersHandlers(setBundle: Dispatch<SetStateAction<CrawlBundle | null>>, notify: Notify) {
  const { t } = useTranslation();

  const commit = useCallback(
    async (save: () => Promise<boolean>, apply: (bundle: CrawlBundle, saved: boolean) => CrawlBundle) => {
      try {
        const saved = await save();
        setBundle((prev) => (prev ? apply(prev, saved) : prev));
        notify(t(saved ? 'crawl.table.answers.toast.enabled' : 'crawl.table.answers.toast.disabled'));
        return true;
      } catch (err) {
        notify(resolveAppErrorMessage(err, t, 'crawl.table.answers.toast.failed'), 'error');
        return false;
      }
    },
    [notify, setBundle, t],
  );

  const handleSetSourceAnswers = useCallback(
    (sourceId: string, enabled: boolean) =>
      commit(
        () => setSourceUseInAnswers(sourceId, enabled),
        (bundle, saved) => ({
          ...bundle,
          sources: bundle.sources.map((source) =>
            source.id === sourceId ? { ...source, use_in_answers: saved } : source,
          ),
        }),
      ),
    [commit],
  );

  const handleSetDocumentAnswers = useCallback(
    (documentId: string, enabled: boolean) =>
      commit(
        () => setDocumentUseInAnswers(documentId, enabled),
        (bundle, saved) => ({
          ...bundle,
          documents: bundle.documents.map((doc) => (doc.id === documentId ? { ...doc, useInAnswers: saved } : doc)),
        }),
      ),
    [commit],
  );

  return { handleSetSourceAnswers, handleSetDocumentAnswers };
}
