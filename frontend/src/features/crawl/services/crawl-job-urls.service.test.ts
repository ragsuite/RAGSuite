import { mapCrawlJobUrlsPage } from '@/features/crawl/services/crawl-job-urls.service';

describe('mapCrawlJobUrlsPage', () => {
  it('maps entries and keeps the server total', () => {
    const page = mapCrawlJobUrlsPage(
      {
        kind: 'failed',
        items: [
          { url: 'https://ex.com/404', reason: 'http_404', status_code: 404, referrers: ['https://ex.com/'] },
          'https://ex.com/plain',
          { reason: 'missing url' },
          null,
        ],
        total: 42,
        offset: 0,
        limit: 100,
      },
      true,
    );

    expect(page.total).toBe(42);
    expect(page.items).toEqual([
      {
        url: 'https://ex.com/404',
        reason: 'http_404',
        status_code: 404,
        referrers: ['https://ex.com/'],
        referrers_truncated: undefined,
      },
      { url: 'https://ex.com/plain' },
    ]);
  });

  it('defaults the total to the page length', () => {
    expect(mapCrawlJobUrlsPage({ items: [{ url: 'https://ex.com/a' }] }, false).total).toBe(1);
  });

  it('rejects non-object responses', () => {
    expect(() => mapCrawlJobUrlsPage(null, false)).toThrow('errors.crawl.jobStatusFailed');
  });
});
