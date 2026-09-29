import type { CrawlEmbeddingTargetOptions } from '@/features/crawl/types/crawl.types';
import {
  buildTrainConfirmCopy,
  isTextualRetrain,
  resolveTextualTrainingState,
  resolveTrainedModelLabels,
  resolveTrainingModelLabels,
  textualStatusDisplay,
} from '@/features/crawl/utils/textual-training';

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

function options(sameCollection: boolean): CrawlEmbeddingTargetOptions {
  return {
    search: { source: 'search', provider: 'mistral', model: 'mistral-embed', collection: 'c_mistral' },
    chat: sameCollection
      ? { source: 'chat', provider: 'mistral', model: 'mistral-embed', collection: 'c_mistral' }
      : { source: 'chat', provider: 'openai', model: 'text-embedding-3-small', collection: 'c_openai' },
    same_collection: sameCollection,
    default_target: 'both',
    providers: [],
    default_provider: null,
  };
}

describe('textual training state', () => {
  it('derives card state from status and existing vectors', () => {
    expect(resolveTextualTrainingState({ status: 'not_trained', chunksCount: 0 })).toBe('not_trained');
    expect(resolveTextualTrainingState({ status: 'not_trained', chunksCount: 4 })).toBe('needs_retrain');
    expect(resolveTextualTrainingState({ status: 'queued', chunksCount: 4 })).toBe('training');
    expect(resolveTextualTrainingState({ status: 'indexed', chunksCount: 4 })).toBe('trained');
    expect(resolveTextualTrainingState({ status: 'failed', chunksCount: 0 })).toBe('failed');
  });

  it('maps states to badge copy and tone', () => {
    expect(textualStatusDisplay({ status: 'not_trained', chunksCount: 0 }).labelKey).toBe(
      'crawl.textual.status.notTrained',
    );
    expect(textualStatusDisplay({ status: 'not_trained', chunksCount: 2 }).tone).toBe('warning');
    expect(textualStatusDisplay({ status: 'indexed', chunksCount: 2 }).tone).toBe('success');
  });

  it('treats sources with vectors as retrains', () => {
    expect(isTextualRetrain({ status: 'not_trained', chunksCount: 0 })).toBe(false);
    expect(isTextualRetrain({ status: 'not_trained', chunksCount: 3 })).toBe(true);
    expect(isTextualRetrain({ status: 'indexed', chunksCount: 0 })).toBe(true);
  });
});

describe('embedding model labels', () => {
  it('dedupes Search and Chat when they share a collection', () => {
    expect(resolveTrainingModelLabels(options(true))).toEqual(['mistral / mistral-embed']);
    expect(resolveTrainingModelLabels(options(false))).toEqual([
      'mistral / mistral-embed',
      'openai / text-embedding-3-small',
    ]);
    expect(resolveTrainingModelLabels(null)).toEqual([]);
  });

  it('reads actual indexed models from coverage', () => {
    expect(
      resolveTrainedModelLabels({
        id: 'd1',
        missing_active: false,
        embedded_models: [
          { provider: 'mistral', model: 'mistral-embed', collection: 'c_mistral', is_active: true },
          { provider: 'mistral', model: 'mistral-embed', collection: 'c_mistral', is_active: true },
        ],
      }),
    ).toEqual(['mistral / mistral-embed']);
    expect(resolveTrainedModelLabels(undefined)).toEqual([]);
  });
});

describe('train confirmation copy', () => {
  it('names the model on first training', () => {
    const copy = buildTrainConfirmCopy(
      { name: 'Policy', targetModels: ['mistral / mistral-embed'], trainedModels: [], isRetrain: false },
      t,
    );
    expect(copy.title).toBe('crawl.textual.confirm.train.title');
    expect(copy.message).toContain('mistral / mistral-embed');
    expect(copy.confirmLabel).toBe('crawl.textual.action.train');
  });

  it('mentions the previous model only when retraining switches models', () => {
    const same = buildTrainConfirmCopy(
      { name: 'Policy', targetModels: ['a / m1'], trainedModels: ['a / m1'], isRetrain: true },
      t,
    );
    expect(same.title).toBe('crawl.textual.confirm.retrain.title');
    expect(same.message).not.toContain('previousModel');

    const switched = buildTrainConfirmCopy(
      { name: 'Policy', targetModels: ['b / m2'], trainedModels: ['a / m1'], isRetrain: true },
      t,
    );
    expect(switched.message).toContain('crawl.textual.confirm.retrain.previousModel');
    expect(switched.message).toContain('a / m1');
  });

  it('falls back to a generic model label when options are unavailable', () => {
    const copy = buildTrainConfirmCopy({ name: 'Policy', targetModels: [], trainedModels: [], isRetrain: false }, t);
    expect(copy.message).toContain('crawl.textual.model.unknown');
  });
});
