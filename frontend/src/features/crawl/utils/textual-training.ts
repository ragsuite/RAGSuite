import type {
  CrawlDocument,
  CrawlEmbeddedModel,
  CrawlEmbeddingTargetOptions,
} from '@/features/crawl/types/crawl.types';
import { isDocumentIngestInFlight } from '@/features/crawl/utils/crawl-document-status';
import { formatCrawlEmbeddedModelLabel } from '@/features/crawl/utils/crawl-embedding-display';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';
import type { StatusBadgeTone } from '@/shared/components/status-badge';

export type TextualTrainingState = 'not_trained' | 'needs_retrain' | 'training' | 'trained' | 'failed';

type TrainingDoc = Pick<CrawlDocument, 'status' | 'chunksCount'>;

export function resolveTextualTrainingState(doc: TrainingDoc): TextualTrainingState {
  if (isDocumentIngestInFlight(doc.status)) return 'training';
  if (doc.status === 'indexed') return 'trained';
  if (doc.status === 'failed') return 'failed';
  return doc.chunksCount > 0 ? 'needs_retrain' : 'not_trained';
}

/** Vectors from an earlier training exist, so training replaces them. */
export function isTextualRetrain(doc: TrainingDoc): boolean {
  return doc.chunksCount > 0 || doc.status === 'indexed';
}

const STATUS_DISPLAY: Record<TextualTrainingState, { labelKey: string; tone: StatusBadgeTone }> = {
  not_trained: { labelKey: 'crawl.textual.status.notTrained', tone: 'muted' },
  needs_retrain: { labelKey: 'crawl.textual.status.needsRetrain', tone: 'warning' },
  training: { labelKey: 'crawl.textual.status.training', tone: 'default' },
  trained: { labelKey: 'crawl.textual.status.trained', tone: 'success' },
  failed: { labelKey: 'crawl.textual.status.failed', tone: 'danger' },
};

export function textualStatusDisplay(doc: TrainingDoc): { labelKey: string; tone: StatusBadgeTone } {
  return STATUS_DISPLAY[resolveTextualTrainingState(doc)];
}

function dedupeLabels(models: CrawlEmbeddedModel[]): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const model of models) {
    const key = model.collection || `${model.provider ?? ''}:${model.model ?? ''}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    labels.push(formatCrawlEmbeddedModelLabel(model));
  }
  return labels.filter((label) => label.trim().length > 0);
}

/** Models training will embed into: every distinct Search / Chat destination (same rule as uploads). */
export function resolveTrainingModelLabels(options: CrawlEmbeddingTargetOptions | null | undefined): string[] {
  if (!options) return [];
  const targets = [options.search, options.chat].filter((entry) => entry && (entry.provider || entry.model));
  return dedupeLabels(
    targets.map((entry) => ({ provider: entry.provider, model: entry.model, collection: entry.collection })),
  );
}

/** Models that actually hold vectors for this source. */
export function resolveTrainedModelLabels(entry: ItemEmbeddingCoverageEntry | null | undefined): string[] {
  return dedupeLabels(
    (entry?.embedded_models ?? []).map((model) => ({
      provider: model.provider,
      model: model.model,
      collection: model.collection,
    })),
  );
}

type TranslateFn = (key: string, options?: Record<string, string | number>) => string;

export type TrainConfirmInput = {
  name: string;
  targetModels: string[];
  trainedModels: string[];
  isRetrain: boolean;
};

export function joinModelLabels(labels: string[], fallback: string): string {
  return labels.length > 0 ? labels.join(', ') : fallback;
}

export function buildTrainConfirmCopy(
  input: TrainConfirmInput,
  t: TranslateFn,
): { title: string; message: string; confirmLabel: string } {
  const model = joinModelLabels(input.targetModels, t('crawl.textual.model.unknown'));
  const modelChanged =
    input.isRetrain &&
    input.trainedModels.length > 0 &&
    input.trainedModels.some((label) => !input.targetModels.includes(label));

  if (!input.isRetrain) {
    return {
      title: t('crawl.textual.confirm.train.title'),
      message: t('crawl.textual.confirm.train.message', { name: input.name, model }),
      confirmLabel: t('crawl.textual.action.train'),
    };
  }
  const message = t('crawl.textual.confirm.retrain.message', { name: input.name, model });
  return {
    title: t('crawl.textual.confirm.retrain.title'),
    message: modelChanged
      ? `${message} ${t('crawl.textual.confirm.retrain.previousModel', {
          previous: input.trainedModels.join(', '),
        })}`
      : message,
    confirmLabel: t('crawl.textual.action.retrain'),
  };
}
