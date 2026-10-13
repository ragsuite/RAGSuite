import { retainEmbeddingCoverage } from '@/features/crawl/utils/retain-embedding-coverage';
import type { EmbeddingItemCoverage } from '@/features/search-config/types/embedding.types';

function coverage(projectId: string): EmbeddingItemCoverage {
  return {
    project_id: projectId,
    source: 'chat',
    active_provider: 'mistral',
    active_model: 'mistral-embed',
    active_collection: 'proj_a__mistral__x',
    documents: [],
    crawl_sources: [{ id: 's1', embedded_models: [], missing_active: false }],
  };
}

describe('retainEmbeddingCoverage', () => {
  it('uses a fresh result', () => {
    const fresh = coverage('p1');
    expect(retainEmbeddingCoverage(coverage('p1'), fresh, 'p1')).toBe(fresh);
  });

  it('keeps the last coverage of the same project when a refresh fails', () => {
    const previous = coverage('ABC');
    expect(retainEmbeddingCoverage(previous, null, 'abc')).toBe(previous);
  });

  it('drops coverage of another project', () => {
    expect(retainEmbeddingCoverage(coverage('p1'), null, 'p2')).toBeNull();
    expect(retainEmbeddingCoverage(coverage('p1'), null, null)).toBeNull();
  });

  it('stays empty when nothing was loaded yet', () => {
    expect(retainEmbeddingCoverage(null, null, 'p1')).toBeNull();
  });
});
