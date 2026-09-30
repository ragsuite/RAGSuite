import {
  mapAddSourcePayloadToApi,
  mapApiSiteToCrawlSource,
  mapCrawlStatusResponse,
  mapCrawlStatusToJob,
  mapUpdateSourcePayloadToApi,
} from '@/features/crawl/utils/crawl-api-mappers';
import type { AddSourcePayload, CrawlSource } from '@/features/crawl/types/crawl.types';

const baseSource: CrawlSource = {
  id: 'source-1',
  name: 'Example',
  source_type: 'domain',
  base_url: 'https://example.com',
  depth: 2,
  cadence: 'ONCE',
  headless_mode: 'AUTO',
  allowlist: [],
  denylist: [],
  skip_header_footer: true,
  index_site_header: false,
  index_site_footer: false,
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

describe('crawl source_type mapping', () => {
  const payload: AddSourcePayload = {
    name: 'Sitemap',
    source_type: 'sitemap',
    base_url: ' https://example.com/sitemap.xml ',
    depth: 0,
    cadence: 'DAILY',
    headless_mode: 'OFF',
    description: '',
    skip_header_footer: true,
    index_site_header: true,
    index_site_footer: false,
    rescope_root_links: false,
    allowlist: [],
    denylist: [],
  };

  it.each([
    [undefined, 'domain'],
    ['domain', 'domain'],
    ['SITEMAP', 'sitemap'],
    ['rss', 'domain'],
  ])('maps API source_type %p to %p', (raw, expected) => {
    const source = mapApiSiteToCrawlSource({ id: 's1', base_url: 'https://example.com', source_type: raw });
    expect(source?.source_type).toBe(expected);
  });

  it('sends source_type on create, defaulting to domain', () => {
    expect(mapAddSourcePayloadToApi(payload)).toMatchObject({
      source_type: 'sitemap',
      base_url: 'https://example.com/sitemap.xml',
      depth: 0,
    });
    const { source_type: _omit, ...domainPayload } = payload;
    expect(mapAddSourcePayloadToApi(domainPayload).source_type).toBe('domain');
  });

  it('never sends source_type on update (type is immutable)', () => {
    expect(mapUpdateSourcePayloadToApi(payload)).not.toHaveProperty('source_type');
  });
});

describe('site header/footer indexing flags', () => {
  it('defaults both flags to false when the API omits them', () => {
    const source = mapApiSiteToCrawlSource({ id: 's1', base_url: 'https://example.com' });
    expect(source?.index_site_header).toBe(false);
    expect(source?.index_site_footer).toBe(false);
  });

  it('maps each flag independently', () => {
    const source = mapApiSiteToCrawlSource({
      id: 's1',
      base_url: 'https://example.com',
      index_site_header: false,
      index_site_footer: true,
    });
    expect(source?.index_site_header).toBe(false);
    expect(source?.index_site_footer).toBe(true);
  });

  it('sends both flags on create and update', () => {
    const payload: AddSourcePayload = {
      name: 'Docs',
      base_url: 'https://example.com',
      depth: 2,
      cadence: 'ONCE',
      headless_mode: 'OFF',
      description: '',
      skip_header_footer: true,
      index_site_header: true,
      index_site_footer: false,
      rescope_root_links: false,
      allowlist: [],
      denylist: [],
    };
    const expected = { index_site_header: true, index_site_footer: false };
    expect(mapAddSourcePayloadToApi(payload)).toMatchObject(expected);
    expect(mapUpdateSourcePayloadToApi(payload)).toMatchObject(expected);
  });
});
