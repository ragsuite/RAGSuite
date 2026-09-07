import { shouldConfirmManualRecrawl } from '@/features/crawl/utils/crawl-pipeline-status';

describe('shouldConfirmManualRecrawl', () => {
  it('returns false for a first crawl with no prior content', () => {
    expect(
      shouldConfirmManualRecrawl({
        documents_count: 0,
        last_crawl_at: null,
        trained_at: null,
      }),
    ).toBe(false);
  });

  it('returns true when documents_count > 0', () => {
    expect(
      shouldConfirmManualRecrawl({
        documents_count: 10,
        last_crawl_at: null,
        trained_at: null,
      }),
    ).toBe(true);
  });

  it('returns true when last_crawl_at is set', () => {
    expect(
      shouldConfirmManualRecrawl({
        documents_count: 0,
        last_crawl_at: '2026-09-07T10:00:00Z',
        trained_at: null,
      }),
    ).toBe(true);
  });

  it('returns true when trained_at is set', () => {
    expect(
      shouldConfirmManualRecrawl({
        documents_count: 0,
        last_crawl_at: null,
        trained_at: '2026-09-07T10:00:00Z',
      }),
    ).toBe(true);
  });
});
