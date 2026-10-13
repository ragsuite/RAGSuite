import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { mapApiDocument } from '@/features/crawl/utils/document-api-mappers';
import { documentAnswersLockReason, documentUsedInAnswers } from '@/features/crawl/utils/document-answers';
import { readUseInAnswers } from '@/network/actions/answers-response';

type LockInput = Pick<CrawlDocument, 'status' | 'trainingProgress' | 'chunksCount'>;

const trained: LockInput = { status: 'indexed', trainingProgress: null, chunksCount: 6 };

describe('document answers lock', () => {
  it('allows switching a trained, idle Document / Text / Q&A source', () => {
    expect(documentAnswersLockReason(trained)).toBeNull();
  });

  it.each(['queued', 'extracting', 'indexing'] as const)('locks while ingest is %s', (status) => {
    expect(documentAnswersLockReason({ ...trained, status })).toBe('running');
  });

  it('locks while a retrain is in progress', () => {
    const trainingProgress = { mode: 'retrain', stage: 'training', percent: 40, done: 2, total: 5, etaSeconds: null } as const;
    expect(documentAnswersLockReason({ ...trained, trainingProgress })).toBe('running');
  });

  it.each(['not_trained', 'failed'] as const)('locks a %s source with nothing trained', (status) => {
    expect(documentAnswersLockReason({ ...trained, status, chunksCount: 0 })).toBe('empty');
  });

  it('allows an edited Text source that still has earlier training', () => {
    expect(documentAnswersLockReason({ ...trained, status: 'not_trained', chunksCount: 3 })).toBeNull();
  });
});

describe('useInAnswers mapping', () => {
  it('defaults to included when the API omits the flag', () => {
    const doc = mapApiDocument({ id: 'd1', title: 'Returns' });
    expect(doc?.useInAnswers).toBe(true);
    expect(documentUsedInAnswers({ useInAnswers: true })).toBe(true);
  });

  it('keeps an explicit false', () => {
    const doc = mapApiDocument({ id: 'd1', title: 'Returns', useInAnswers: false });
    expect(doc?.useInAnswers).toBe(false);
    expect(documentUsedInAnswers({ useInAnswers: false })).toBe(false);
  });
});

describe('readUseInAnswers', () => {
  it('reads the saved flag from a bare or wrapped response', () => {
    expect(readUseInAnswers({ document_id: 'd1', use_in_answers: false })).toBe(false);
    expect(readUseInAnswers({ data: { source_id: 's1', use_in_answers: true } })).toBe(true);
  });

  it('throws the failed toast key when the flag is missing', () => {
    expect(() => readUseInAnswers({ ok: true })).toThrow('crawl.table.answers.toast.failed');
    expect(() => readUseInAnswers(null)).toThrow('crawl.table.answers.toast.failed');
  });
});
