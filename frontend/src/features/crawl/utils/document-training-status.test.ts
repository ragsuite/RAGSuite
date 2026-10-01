import type { CrawlDocument, DocumentTrainingProgress } from '@/features/crawl/types/crawl.types';
import { parseTrainingProgress } from '@/features/crawl/utils/document-api-mappers';
import {
  countDocumentTrainingNeeds,
  documentStatusDisplay,
  formatDocumentTrainedDate,
  formatDocumentTrainingDetail,
  formatTrainingEta,
  idleCoverageEntry,
  partitionPinnedDocumentIds,
  resolveBulkTrainingAction,
  resolveDocumentTrainingMode,
  resolveDocumentTrainingPhase,
  trainingActionLabelKey,
} from '@/features/crawl/utils/document-training-status';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';

function doc(overrides: Partial<CrawlDocument>): CrawlDocument {
  return {
    id: 'doc-1',
    name: 'sheet',
    title: 'Sheet',
    description: null,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sizeKb: 1,
    sourceLabel: 'upload',
    language: 'en',
    indexedAt: '2026-10-01T10:00:00Z',
    status: 'indexed',
    checksum: '',
    chunksCount: 4,
    embeddedModels: [],
    fileUrl: null,
    trainingProgress: null,
    ingestEmbeddingTarget: null,
    ...overrides,
  };
}

function progress(overrides: Partial<DocumentTrainingProgress>): DocumentTrainingProgress {
  return { mode: 'train', stage: 'training', percent: 40, done: 4, total: 10, etaSeconds: 90, ...overrides };
}

function coverage(id: string, overrides: Partial<ItemEmbeddingCoverageEntry> = {}): ItemEmbeddingCoverageEntry {
  return { id, embedded_models: [], missing_active: false, ...overrides };
}

const fakeT = (key: string, options?: Record<string, string | number>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

const freshUpload = doc({ id: 'new', status: 'queued', chunksCount: 0, indexedAt: null });
const missingActive = coverage('old', {
  missing_active: true,
  embedded_models: [{ provider: 'openai', model: 'small', is_active: false }] as ItemEmbeddingCoverageEntry['embedded_models'],
});

describe('resolveDocumentTrainingPhase / mode', () => {
  it('never says "retrain" for a first upload', () => {
    expect(resolveDocumentTrainingMode(freshUpload)).toBe('train');
    expect(documentStatusDisplay(freshUpload).labelKey).toBe('documents.status.queued');
  });

  it('labels an in-flight first upload as Training, not Indexing', () => {
    const display = documentStatusDisplay(doc({ status: 'indexing', chunksCount: 0, indexedAt: null }));
    expect(display).toEqual({ labelKey: 'documents.status.indexing', tone: 'default', active: true });
  });

  it('uses live progress stage and mode over the stored status', () => {
    const d = doc({ status: 'indexed', trainingProgress: progress({ mode: 'retrain', stage: 'saving' }) });
    expect(resolveDocumentTrainingPhase(d)).toBe('saving');
    expect(documentStatusDisplay(d).labelKey).toBe('documents.status.saving');
    const retraining = doc({ trainingProgress: progress({ mode: 'retrain' }) });
    expect(documentStatusDisplay(retraining).labelKey).toBe('documents.status.retraining');
  });

  it('flags an idle trained document missing the active model as needing retraining', () => {
    const d = doc({ id: 'old' });
    expect(resolveDocumentTrainingPhase(d, missingActive)).toBe('needs_retrain');
    expect(documentStatusDisplay(d, missingActive).tone).toBe('warning');
  });

  it('maps failed and not-trained documents', () => {
    expect(documentStatusDisplay(doc({ status: 'failed' })).labelKey).toBe('documents.status.failed');
    expect(documentStatusDisplay(doc({ status: 'not_trained', chunksCount: 0 })).labelKey).toBe(
      'documents.status.notTrained',
    );
    expect(resolveDocumentTrainingPhase(doc({ status: 'not_trained', chunksCount: 3 }))).toBe('needs_retrain');
  });
});

describe('coverage helpers', () => {
  it('ignores coverage warnings while a document is training', () => {
    expect(idleCoverageEntry(doc({ status: 'indexing' }), missingActive)).toBeNull();
    expect(idleCoverageEntry(doc({ id: 'old' }), missingActive)).toBe(missingActive);
  });

  it('splits needs into train and retrain and skips in-flight documents', () => {
    const docs = [
      doc({ id: 'old' }),
      doc({ id: 'never', status: 'not_trained', chunksCount: 0, indexedAt: null }),
      doc({ id: 'busy', status: 'indexing', chunksCount: 0 }),
    ];
    const byId = new Map([
      ['old', missingActive],
      ['busy', coverage('busy', { missing_active: true })],
    ]);
    expect(countDocumentTrainingNeeds(docs, byId)).toEqual({ train: 1, retrain: 1 });
  });

  it('shows a dash as trained date for never-trained documents', () => {
    expect(formatDocumentTrainedDate(freshUpload)).toBe('—');
  });
});

describe('resolveBulkTrainingAction', () => {
  it('offers Train when nothing selected was trained before', () => {
    const neverTrained = doc({ id: 'never', status: 'not_trained', chunksCount: 0, indexedAt: null });
    const action = resolveBulkTrainingAction([neverTrained, freshUpload], new Map());
    expect(action).toEqual({ mode: 'train', eligibleIds: ['never'], activeCount: 1 });
    expect(trainingActionLabelKey(action.mode)).toBe('documents.bulk.train');
  });

  it('offers Retrain and skips documents already training', () => {
    const busy = doc({ id: 'busy', trainingProgress: progress({}) });
    const action = resolveBulkTrainingAction([doc({ id: 'old' }), busy], new Map());
    expect(action).toEqual({ mode: 'retrain', eligibleIds: ['old'], activeCount: 1 });
    expect(trainingActionLabelKey(action.mode)).toBe('documents.bulk.reindex');
  });
});

describe('partitionPinnedDocumentIds', () => {
  it('routes pinned documents to their own model and keeps unknown ids on the shared reindex', () => {
    const docs = [doc({ id: 'pinned', ingestEmbeddingTarget: 'mistral' }), doc({ id: 'legacy' })];
    expect(partitionPinnedDocumentIds(['pinned', 'legacy', 'missing'], docs)).toEqual({
      pinnedIds: ['pinned'],
      sharedIds: ['legacy', 'missing'],
    });
  });
});

describe('formatting', () => {
  it('formats ETA buckets', () => {
    expect(formatTrainingEta(null, fakeT)).toBeNull();
    expect(formatTrainingEta(20, fakeT)).toBe('documents.training.etaUnderMinute');
    expect(formatTrainingEta(300, fakeT)).toBe('documents.training.etaMinutes:{"count":5}');
    expect(formatTrainingEta(3900, fakeT)).toBe('documents.training.etaHours:{"hours":1,"minutes":5}');
  });

  it('builds the per-document detail line', () => {
    expect(formatDocumentTrainingDetail(freshUpload, fakeT)).toBe('documents.training.waiting');
    expect(formatDocumentTrainingDetail(doc({ trainingProgress: progress({}) }), fakeT)).toBe(
      [
        'documents.training.percent:{"percent":40}',
        'documents.training.pieces:{"done":4,"total":10}',
        'documents.training.etaMinutes:{"count":2}',
      ].join(' · '),
    );
    expect(formatDocumentTrainingDetail(doc({}), fakeT)).toBeNull();
  });
});

describe('parseTrainingProgress', () => {
  it('maps the API payload', () => {
    expect(
      parseTrainingProgress({ mode: 'retrain', stage: 'training', percent: 42, done: 3, total: 7, eta_seconds: 61.6 }),
    ).toEqual({ mode: 'retrain', stage: 'training', percent: 42, done: 3, total: 7, etaSeconds: 62 });
  });

  it('rejects unknown stages and sanitises numbers', () => {
    expect(parseTrainingProgress(null)).toBeNull();
    expect(parseTrainingProgress({ stage: 'indexing' })).toBeNull();
    expect(parseTrainingProgress({ mode: 'weird', stage: 'queued', percent: 150, eta_seconds: -5 })).toEqual({
      mode: 'train',
      stage: 'queued',
      percent: 100,
      done: 0,
      total: 0,
      etaSeconds: null,
    });
  });
});
