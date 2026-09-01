import type { EmbeddingStatus } from '@/features/search-config/types/embedding.types';
import {
  buildEmbeddingStatusSummaryLines,
  embeddingStatusSummaryEmptyBodyKey,
  embeddingStatusSummaryTitleKey,
} from '@/features/search-config/utils/embedding-status-summary';

function sampleStatus(overrides: Partial<EmbeddingStatus> = {}): EmbeddingStatus {
  return {
    project_id: 'proj-1',
    source: 'chat',
    active_provider: 'mistral',
    active_model: 'mistral-embed',
    active_collection: 'proj_mistral',
    active_vectors: 9836,
    total_documents: 5,
    needs_reindex: true,
    coverage_items_total: 2,
    coverage_items_embedded: 1,
    coverage_items_missing: 1,
    missing_uploaded_count: 0,
    missing_crawl_sources_count: 1,
    crawl_sources_total: 5,
    crawl_sources_expected: 2,
    crawl_sources_other_surface: 3,
    other_collections: [],
    model_meta: {
      dim: 1024,
      max_tokens: 8192,
      batch: 32,
      metric: 'cosine',
      normalize: true,
      needs_api_key: true,
      known: true,
    },
    fallback_used: false,
    ...overrides,
  };
}

const t = (key: string, options?: Record<string, string | number>) => {
  const suffix = options
    ? Object.entries(options)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')
    : '';
  return suffix ? `${key}|${suffix}` : key;
};

describe('embedding-status-summary', () => {
  it('builds chat needs-reindex lines with crawl totals and missing breakdown', () => {
    const lines = buildEmbeddingStatusSummaryLines(
      sampleStatus(),
      'chatbot',
      'needs-reindex',
      t,
    );

    expect(lines.map((line) => line.kind)).toEqual([
      'coverage',
      'missing',
      'projectCrawl',
      'vectors',
    ]);
    expect(lines[0].text).toContain('embedded=1');
    expect(lines[0].text).toContain('total=2');
    expect(lines[1].text).toContain('missing=1');
    expect(lines[1].text).toContain('missingCrawl=1');
    expect(lines[1].text).toContain('missingUploads=0');
    expect(lines[2].text).toContain('total=5');
    expect(lines[2].text).toContain('expected=2');
    expect(lines[2].text).toContain('other=3');
    expect(lines[2].text).toContain('uploads=0');
    expect(lines[3].text).toContain('count=9,836');
  });

  it('builds search ok lines with other-surface crawl context', () => {
    const lines = buildEmbeddingStatusSummaryLines(
      sampleStatus({
        source: 'search',
        needs_reindex: false,
        coverage_items_total: 3,
        coverage_items_embedded: 3,
        coverage_items_missing: 0,
        missing_crawl_sources_count: 0,
        crawl_sources_expected: 3,
        crawl_sources_other_surface: 2,
        active_vectors: 1200,
      }),
      'search',
      'ok',
      t,
    );

    expect(lines.map((line) => line.kind)).toEqual(['coverage', 'projectCrawl', 'vectors']);
    expect(lines[0].text).toContain('embedded=3');
    expect(lines[0].text).toContain('total=3');
    expect(lines[1].text).toContain('other=2');
  });

  it('derives upload-only scope when no crawl sources are expected', () => {
    const lines = buildEmbeddingStatusSummaryLines(
      sampleStatus({
        coverage_items_total: 4,
        coverage_items_embedded: 4,
        coverage_items_missing: 0,
        crawl_sources_total: 0,
        crawl_sources_expected: 0,
        crawl_sources_other_surface: 0,
        needs_reindex: false,
      }),
      'chatbot',
      'ok',
      t,
    );

    expect(lines.map((line) => line.kind)).toEqual(['coverage', 'vectors']);
    expect(lines.some((line) => line.kind === 'projectCrawl')).toBe(false);
  });

  it('includes uploads in project crawl line when uploads are in scope', () => {
    const lines = buildEmbeddingStatusSummaryLines(
      sampleStatus({
        coverage_items_total: 4,
        crawl_sources_expected: 2,
        crawl_sources_total: 5,
      }),
      'chatbot',
      'ok',
      t,
    );

    const projectLine = lines.find((line) => line.kind === 'projectCrawl');
    expect(projectLine?.text).toContain('uploads=2');
  });

  it('resolves title and empty body keys per namespace', () => {
    expect(embeddingStatusSummaryTitleKey('chatbot', 'empty')).toBe(
      'chatbot.embedding.status.empty.title',
    );
    expect(embeddingStatusSummaryTitleKey('search', 'empty')).toBe(
      'search.embedding.status.emptyIndexed.title',
    );
    expect(embeddingStatusSummaryEmptyBodyKey('chatbot')).toBe(
      'chatbot.embedding.status.empty.body',
    );
    expect(embeddingStatusSummaryEmptyBodyKey('search')).toBe(
      'search.embedding.status.emptyIndexed.body',
    );
  });
});
