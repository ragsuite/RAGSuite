import type {
  CrawlDocument,
  DocumentTrainingMode,
  DocumentTrainingStage,
} from '@/features/crawl/types/crawl.types';
import { isDocumentTrainingActive } from '@/features/crawl/utils/crawl-document-status';
import { formatDocumentIndexedDate } from '@/features/crawl/utils/document-form';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';

export type DocumentTrainingPhase =
  | DocumentTrainingStage
  | 'trained'
  | 'needs_retrain'
  | 'failed'
  | 'not_trained';

export type DocumentStatusTone = 'default' | 'success' | 'muted' | 'danger' | 'warning';

type TrainingDoc = Pick<CrawlDocument, 'status' | 'chunksCount' | 'trainingProgress'>;
type Coverage = ItemEmbeddingCoverageEntry | null | undefined;
type TranslateFn = (key: string, options?: Record<string, string | number>) => string;

const ACTIVE_PHASES: ReadonlySet<DocumentTrainingPhase> = new Set(['queued', 'reading', 'training', 'saving']);

export function isActiveTrainingPhase(phase: DocumentTrainingPhase): boolean {
  return ACTIVE_PHASES.has(phase);
}

/** Vectors from an earlier training exist, so the next run replaces them. */
export function wasDocumentTrained(doc: TrainingDoc, coverage?: Coverage): boolean {
  return doc.chunksCount > 0 || doc.status === 'indexed' || (coverage?.embedded_models?.length ?? 0) > 0;
}

export function resolveDocumentTrainingMode(doc: TrainingDoc, coverage?: Coverage): DocumentTrainingMode {
  if (doc.trainingProgress) return doc.trainingProgress.mode;
  return wasDocumentTrained(doc, coverage) ? 'retrain' : 'train';
}

export function resolveDocumentTrainingPhase(doc: TrainingDoc, coverage?: Coverage): DocumentTrainingPhase {
  if (doc.trainingProgress) return doc.trainingProgress.stage;
  switch (doc.status) {
    case 'queued':
      return 'queued';
    case 'extracting':
      return 'reading';
    case 'indexing':
      return 'training';
    case 'failed':
      return 'failed';
    case 'not_trained':
      return doc.chunksCount > 0 ? 'needs_retrain' : 'not_trained';
    default:
      return coverage?.missing_active ? 'needs_retrain' : 'trained';
  }
}

const PHASE_LABEL_KEYS: Record<DocumentTrainingPhase, Record<DocumentTrainingMode, string>> = {
  queued: { train: 'documents.status.queued', retrain: 'documents.status.queuedRetrain' },
  reading: { train: 'documents.status.extracting', retrain: 'documents.status.extracting' },
  training: { train: 'documents.status.indexing', retrain: 'documents.status.retraining' },
  saving: { train: 'documents.status.saving', retrain: 'documents.status.saving' },
  trained: { train: 'documents.status.indexed', retrain: 'documents.status.indexed' },
  needs_retrain: { train: 'documents.status.needsRetrain', retrain: 'documents.status.needsRetrain' },
  failed: { train: 'documents.status.failed', retrain: 'documents.status.failed' },
  not_trained: { train: 'documents.status.notTrained', retrain: 'documents.status.notTrained' },
};

const PHASE_TONES: Record<DocumentTrainingPhase, DocumentStatusTone> = {
  queued: 'muted',
  reading: 'muted',
  training: 'default',
  saving: 'default',
  trained: 'success',
  needs_retrain: 'warning',
  failed: 'danger',
  not_trained: 'muted',
};

export function documentStatusDisplay(
  doc: TrainingDoc,
  coverage?: Coverage,
): { labelKey: string; tone: DocumentStatusTone; active: boolean } {
  const phase = resolveDocumentTrainingPhase(doc, coverage);
  const mode = resolveDocumentTrainingMode(doc, coverage);
  return { labelKey: PHASE_LABEL_KEYS[phase][mode], tone: PHASE_TONES[phase], active: isActiveTrainingPhase(phase) };
}

/** Coverage warnings only apply to idle documents — in-flight ones are being trained right now. */
export function idleCoverageEntry(doc: TrainingDoc, coverage?: Coverage): ItemEmbeddingCoverageEntry | null {
  return isDocumentTrainingActive(doc) ? null : coverage ?? null;
}

export function formatDocumentTrainedDate(doc: TrainingDoc & Pick<CrawlDocument, 'indexedAt'>): string {
  return wasDocumentTrained(doc) ? formatDocumentIndexedDate(doc.indexedAt) : '—';
}

export type DocumentTrainingNeed = 'train' | 'retrain' | null;

/** What an idle document needs so search/chat can use it with the active model. */
export function resolveDocumentTrainingNeed(doc: TrainingDoc, coverage?: Coverage): DocumentTrainingNeed {
  if (isDocumentTrainingActive(doc)) return null;
  const missing = doc.status === 'failed' || doc.status === 'not_trained' || Boolean(coverage?.missing_active);
  if (!missing) return null;
  return wasDocumentTrained(doc, coverage) ? 'retrain' : 'train';
}

export function countDocumentTrainingNeeds(
  docs: CrawlDocument[],
  coverageById: Map<string, ItemEmbeddingCoverageEntry>,
): { train: number; retrain: number } {
  const counts = { train: 0, retrain: 0 };
  for (const doc of docs) {
    const need = resolveDocumentTrainingNeed(doc, coverageById.get(doc.id));
    if (need) counts[need] += 1;
  }
  return counts;
}

export function trainingActionLabelKey(mode: DocumentTrainingMode): string {
  return mode === 'train' ? 'documents.bulk.train' : 'documents.bulk.reindex';
}

export type BulkTrainingAction = {
  mode: DocumentTrainingMode;
  eligibleIds: string[];
  activeCount: number;
};

/** Selected documents already training are left alone; the rest are trained or retrained. */
export function resolveBulkTrainingAction(
  docs: CrawlDocument[],
  coverageById: Map<string, ItemEmbeddingCoverageEntry>,
): BulkTrainingAction {
  const eligible = docs.filter((doc) => !isDocumentTrainingActive(doc));
  const retrain = eligible.some((doc) => wasDocumentTrained(doc, coverageById.get(doc.id)));
  return {
    mode: retrain ? 'retrain' : 'train',
    eligibleIds: eligible.map((doc) => doc.id),
    activeCount: docs.length - eligible.length,
  };
}

export type TrainingIdPartition = { pinnedIds: string[]; sharedIds: string[] };

/**
 * Documents pinned to one AI model retrain through their own provider; the rest
 * (no pin, or not loaded) follow the Search/Chat reindex.
 */
export function partitionPinnedDocumentIds(
  ids: string[],
  docs: Pick<CrawlDocument, 'id' | 'ingestEmbeddingTarget'>[],
): TrainingIdPartition {
  const pinned = new Set(docs.filter((doc) => doc.ingestEmbeddingTarget).map((doc) => doc.id));
  return {
    pinnedIds: ids.filter((id) => pinned.has(id)),
    sharedIds: ids.filter((id) => !pinned.has(id)),
  };
}

export function formatTrainingEta(seconds: number | null, t: TranslateFn): string | null {
  if (seconds == null || seconds <= 0) return null;
  if (seconds < 60) return t('documents.training.etaUnderMinute');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t('documents.training.etaMinutes', { count: minutes });
  return t('documents.training.etaHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

/** One-line detail under a document's progress bar. */
export function formatDocumentTrainingDetail(doc: TrainingDoc, t: TranslateFn): string | null {
  const phase = resolveDocumentTrainingPhase(doc);
  if (phase === 'queued') return t('documents.training.waiting');
  if (phase === 'reading') return t('documents.training.reading');
  if (phase === 'saving') return t('documents.training.saving');
  if (phase !== 'training') return null;
  const progress = doc.trainingProgress;
  if (!progress) return t('documents.training.inProgress');
  const parts = [t('documents.training.percent', { percent: progress.percent })];
  if (progress.total > 0) {
    parts.push(t('documents.training.pieces', { done: progress.done, total: progress.total }));
  }
  const eta = formatTrainingEta(progress.etaSeconds, t);
  if (eta) parts.push(eta);
  return parts.join(' · ');
}
