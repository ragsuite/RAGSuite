import { mapCrawlStatusResponse, mapCrawlStatusToJob } from '@/features/crawl/utils/crawl-api-mappers';
import type { CrawlSource } from '@/features/crawl/types/crawl.types';

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
  documents_count: 278,
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

describe('mapCrawlStatusResponse', () => {
  it('uses crawled_urls_total for crawled count when pages_fetched is zero', () => {
    const status = mapCrawlStatusResponse({
      status: 'COMPLETED',
      progress_percentage: 100,
      pages_fetched: 0,
      crawled_urls_total: 278,
      crawled_urls: [{ url: 'https://example.com/' }],
      skipped_count: 9,
      skipped_urls: [],
      failed_count: 0,
      failed_urls: [],
      pipeline_status: 'ready',
      is_trained: true,
      is_search_ready: true,
    });

    expect(status?.crawledUrlsTotal).toBe(278);
    expect(status?.pagesCrawled).toBe(0);
  });

  it('falls back to pages_fetched when crawled_urls_total is missing', () => {
    const status = mapCrawlStatusResponse({
      status: 'RUNNING',
      progress_percentage: 40,
      pages_fetched: 16,
      crawled_urls: [],
      skipped_count: 0,
      skipped_urls: [],
      failed_count: 0,
      failed_urls: [],
      pipeline_status: 'crawling',
    });

    expect(status?.crawledUrlsTotal).toBe(16);
  });
});

describe('mapCrawlStatusToJob', () => {
  it('maps crawledCount from crawled_urls_total and keeps documents_count from source', () => {
    const status = mapCrawlStatusResponse({
      status: 'COMPLETED',
      progress_percentage: 100,
      pages_fetched: 0,
      crawled_urls_total: 278,
      crawled_urls: [{ url: 'https://example.com/' }],
      skipped_count: 9,
      skipped_urls: [],
      failed_count: 0,
      failed_urls: [],
      pipeline_status: 'ready',
      is_trained: true,
      is_search_ready: true,
    });

    expect(status).not.toBeNull();
    const job = mapCrawlStatusToJob(baseSource, 'job-1', status!);
    expect(job.crawledCount).toBe(278);
    expect(job.documents_count).toBe(278);
  });
});
