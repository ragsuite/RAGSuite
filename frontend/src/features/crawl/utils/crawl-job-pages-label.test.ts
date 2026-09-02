import { formatCrawlJobPagesLabel } from '@/features/crawl/utils/crawl-job-pages-label';
import type { CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';

const t = (key: string, params?: Record<string, string | number>) => {
  if (key === 'crawl.jobs.pagesIndexed') return `${params?.count} indexed`;
  if (key === 'crawl.jobs.pagesVisitedIndexed') {
    return `${params?.visited} visited · ${params?.indexed} indexed`;
  }
  return key;
};

const baseSource: CrawlSource = {
  id: 'source-1',
  name: 'Example',
  base_url: 'https://example.com',
  depth: 2,
  cadence: 'ONCE',
  headless_mode: 'AUTO',
  allowlist: [],
  denylist: [],
  skip_header_footer: true,
  description: '',
  status: 'READY',
  is_active: true,
  rescope_root_links: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_crawl_at: null,
  documents_count: 110,
  trained_at: '2026-01-02T00:00:00.000Z',
  pipeline_status: 'ready',
  is_search_ready: true,
  created_by: 'user',
  latest_job_id: 'job-1',
  active_job_id: null,
  progress_percentage: 100,
  status_message: '',
  ingest_embedding_target: 'chat',
  indexed_embedding_models: [],
};

const baseJob: CrawlJob = {
  id: 'job-1',
  source_id: 'source-1',
  name: 'Example',
  base_url: 'https://example.com',
  status: 'FINISHED',
  documents_count: 110,
  finished_at: null,
  is_ready: true,
  progress_percentage: 100,
  pipeline_status: 'ready',
  embeddedModels: [],
  crawledCount: 121,
  skippedCount: 0,
  failedCount: 0,
  crawledUrls: [],
  skippedUrls: [],
  failedUrls: [],
};

describe('formatCrawlJobPagesLabel', () => {
  it('shows indexed count when idle', () => {
    expect(formatCrawlJobPagesLabel(baseSource, baseJob, t)).toBe('110 indexed');
  });

  it('shows visited and indexed while crawling', () => {
    expect(
      formatCrawlJobPagesLabel(
        { ...baseSource, pipeline_status: 'crawling' },
        { ...baseJob, crawledCount: 12 },
        t,
      ),
    ).toBe('12 visited · 110 indexed');
  });
});
