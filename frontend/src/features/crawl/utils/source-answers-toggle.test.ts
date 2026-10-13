import type { CrawlSource } from '@/features/crawl/types/crawl.types';
import { mapApiSiteToCrawlSource } from '@/features/crawl/utils/crawl-api-mappers';
import {
  canToggleSourceAnswers,
  sourceAnswersLockReason,
  sourceUsedInAnswers,
} from '@/features/crawl/utils/crawl.utils';
import { commitSourceAnswersToggle } from '@/features/crawl/utils/source-answers-toggle';

type LockInput = Pick<CrawlSource, 'active_job_id' | 'pipeline_status' | 'trained_at' | 'documents_count'>;

const trained: LockInput = {
  active_job_id: null,
  pipeline_status: 'ready',
  trained_at: '2026-01-02T00:00:00.000Z',
  documents_count: 10,
};

describe('source answers lock', () => {
  it('allows switching a trained, idle source', () => {
    expect(sourceAnswersLockReason(trained)).toBeNull();
    expect(canToggleSourceAnswers(trained)).toBe(true);
  });

  it.each(['waiting', 'queued', 'crawling', 'indexing'] as const)('locks while the pipeline is %s', (status) => {
    expect(sourceAnswersLockReason({ ...trained, pipeline_status: status })).toBe('running');
  });

  it('locks while a job is active', () => {
    expect(canToggleSourceAnswers({ ...trained, active_job_id: 'job-1' })).toBe(false);
  });

  it('allows a stopped source that indexed some pages', () => {
    expect(canToggleSourceAnswers({ ...trained, trained_at: null, pipeline_status: 'idle', documents_count: 4 })).toBe(true);
  });

  it('locks a source with nothing indexed', () => {
    expect(sourceAnswersLockReason({ ...trained, trained_at: null, documents_count: 0 })).toBe('empty');
  });
});

describe('use_in_answers mapping', () => {
  it('defaults to included when the API omits the flag', () => {
    const source = mapApiSiteToCrawlSource({ id: 's1', name: 'Shop', base_url: 'https://shop.example' });
    expect(source?.use_in_answers).toBe(true);
    expect(sourceUsedInAnswers({})).toBe(true);
  });

  it('keeps an explicit false', () => {
    const source = mapApiSiteToCrawlSource({ id: 's1', name: 'Shop', base_url: 'https://shop.example', use_in_answers: false });
    expect(source?.use_in_answers).toBe(false);
    expect(sourceUsedInAnswers({ use_in_answers: false })).toBe(false);
  });
});

describe('commitSourceAnswersToggle', () => {
  it('shows the new value while saving, then hands back to the saved value', async () => {
    const shown: Array<boolean | null> = [];
    const ok = await commitSourceAnswersToggle(false, async () => true, (v) => shown.push(v));
    expect(ok).toBe(true);
    expect(shown).toEqual([false, null]);
  });

  it('rolls back when the server rejects', async () => {
    const shown: Array<boolean | null> = [];
    const ok = await commitSourceAnswersToggle(false, async () => false, (v) => shown.push(v));
    expect(ok).toBe(false);
    expect(shown).toEqual([false, null]);
  });

  it('rolls back when the save throws', async () => {
    const shown: Array<boolean | null> = [];
    const ok = await commitSourceAnswersToggle(
      true,
      async () => {
        throw new Error('network');
      },
      (v) => shown.push(v),
    );
    expect(ok).toBe(false);
    expect(shown).toEqual([true, null]);
  });
});
