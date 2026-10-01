import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useCrawlManagement } from '@/features/crawl/hooks/useCrawlManagement';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { buildCoverageByDocumentId } from '@/features/crawl/utils/document-api-mappers';
import {
  buildTrainConfirmCopy,
  isTextualRetrain,
  joinModelLabels,
  resolveItemTrainingModelLabels,
  resolveTrainedModelLabels,
} from '@/features/crawl/utils/textual-training';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';
import { useConfirm } from '@/shared/confirm/confirm-provider';

/**
 * Explicit Train action for Text / Q&A sources: confirm with the embedding model,
 * start training, and toast once polling shows the run finished.
 */
export function useTextualTraining(items: CrawlDocument[], trainSource: (documentId: string) => Promise<string>) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { embeddingCoverage, embeddingTargetOptions, reloadBundle, notify } = useCrawlManagement();
  const [trainRequestIds, setTrainRequestIds] = useState<ReadonlySet<string>>(() => new Set());
  const watchedIds = useRef(new Set<string>());

  const targetModelsFor = useCallback(
    (doc: CrawlDocument) => resolveItemTrainingModelLabels(doc, embeddingTargetOptions),
    [embeddingTargetOptions],
  );
  const coverageById = useMemo(() => buildCoverageByDocumentId(embeddingCoverage), [embeddingCoverage]);

  const trainedModelsFor = useCallback(
    (doc: CrawlDocument) =>
      resolveTrainedModelLabels(coverageById.get(doc.id) ?? coverageById.get(doc.id.toLowerCase())),
    [coverageById],
  );

  const setRequestPending = useCallback((id: string, pending: boolean) => {
    setTrainRequestIds((current) => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    for (const id of Array.from(watchedIds.current)) {
      const doc = items.find((item) => item.id === id);
      if (!doc) {
        watchedIds.current.delete(id);
        continue;
      }
      const name = doc.title?.trim() || doc.name;
      if (doc.status === 'indexed') {
        watchedIds.current.delete(id);
        const trained = trainedModelsFor(doc);
        const model = joinModelLabels(trained.length > 0 ? trained : targetModelsFor(doc), t('crawl.textual.model.unknown'));
        notify(t('crawl.textual.toast.trained', { name, model }));
      } else if (doc.status === 'failed') {
        watchedIds.current.delete(id);
        notify(t('crawl.textual.toast.trainFailed', { name }), 'error');
      }
    }
  }, [items, notify, t, targetModelsFor, trainedModelsFor]);

  const train = useCallback(
    async (doc: CrawlDocument) => {
      if (trainRequestIds.has(doc.id)) return;
      const name = doc.title?.trim() || doc.name;
      const copy = buildTrainConfirmCopy(
        { name, targetModels: targetModelsFor(doc), trainedModels: trainedModelsFor(doc), isRetrain: isTextualRetrain(doc) },
        t,
      );
      const confirmed = await confirm({
        title: copy.title,
        message: copy.message,
        confirmLabel: copy.confirmLabel,
        cancelLabel: t('common.cancel'),
        variant: 'confirm',
      });
      if (!confirmed) return;

      setRequestPending(doc.id, true);
      try {
        const status = await trainSource(doc.id);
        watchedIds.current.add(doc.id);
        // Inline ingest already finished; the completion toast follows the refresh instead.
        if (status.trim().toLowerCase() === 'queued') {
          notify(t('crawl.textual.toast.trainStarted', { name }));
        }
        await reloadBundle();
      } catch (err) {
        notify(resolveAppErrorMessage(err, t, 'crawl.textual.toast.trainRequestFailed'), 'error');
      } finally {
        setRequestPending(doc.id, false);
      }
    },
    [confirm, notify, reloadBundle, setRequestPending, t, targetModelsFor, trainRequestIds, trainSource, trainedModelsFor],
  );

  return { targetModelsFor, trainedModelsFor, trainRequestIds, train };
}
