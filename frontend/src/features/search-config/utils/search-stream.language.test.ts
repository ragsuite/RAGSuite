import { buildSearchStreamRequestBody } from '@/features/search-config/utils/search-stream';

describe('buildSearchStreamRequestBody language', () => {
  it('omits language when unset (non-breaking default)', () => {
    const body = buildSearchStreamRequestBody({
      query: 'hello',
      topK: 5,
      similarityThreshold: 0.2,
      useReranker: false,
    });
    expect(body.language).toBeUndefined();
  });

  it('includes language when provided', () => {
    const body = buildSearchStreamRequestBody({
      query: 'hello',
      topK: 5,
      similarityThreshold: 0.2,
      useReranker: false,
      language: 'de',
    });
    expect(body.language).toBe('de');
  });
});
