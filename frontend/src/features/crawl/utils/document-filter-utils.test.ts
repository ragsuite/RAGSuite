import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import {
  countActiveSourceListFilters,
  DEFAULT_SOURCE_LIST_FILTERS,
  filterSourceList,
  filterUploadDocumentsList,
  matchesDocumentQuery,
} from '@/features/crawl/utils/document-filter-utils';

function doc(overrides: Partial<CrawlDocument>): CrawlDocument {
  return {
    id: 'doc-1',
    name: 'opening-hours',
    title: 'Opening hours',
    description: null,
    mimeType: 'text/plain',
    sizeKb: 1,
    sourceLabel: 'text',
    language: 'en',
    indexedAt: null,
    status: 'indexed',
    checksum: '',
    chunksCount: 1,
    embeddedModels: [],
    fileUrl: null,
    ...overrides,
  };
}

describe('filterSourceList', () => {
  const trained = doc({ id: 'a', name: 'opening-hours', title: 'Opening hours', status: 'indexed' });
  const training = doc({
    id: 'b',
    name: 'refund-policy',
    title: 'Refund policy',
    description: 'Returns within 30 days',
    status: 'indexing',
  });
  const failed = doc({ id: 'c', name: 'shipping', title: 'Shipping', status: 'failed' });
  const items = [trained, training, failed];

  it('returns every item with default filters', () => {
    expect(filterSourceList(items, DEFAULT_SOURCE_LIST_FILTERS)).toEqual(items);
  });

  it('matches the query against title and description, case-insensitively', () => {
    expect(filterSourceList(items, { query: '  OPENING ', status: 'all' })).toEqual([trained]);
    expect(filterSourceList(items, { query: '30 days', status: 'all' })).toEqual([training]);
    expect(filterSourceList(items, { query: 'nothing-matches', status: 'all' })).toEqual([]);
  });

  it('applies the status filter using document ingest states', () => {
    expect(filterSourceList(items, { query: '', status: 'indexed' })).toEqual([trained]);
    expect(filterSourceList(items, { query: '', status: 'processing' })).toEqual([training]);
    expect(filterSourceList(items, { query: '', status: 'error' })).toEqual([failed]);
  });

  it('combines query and status', () => {
    expect(filterSourceList(items, { query: 'refund', status: 'indexed' })).toEqual([]);
  });

  it('counts only the status dimension as an active filter', () => {
    expect(countActiveSourceListFilters({ query: 'abc', status: 'all' })).toBe(0);
    expect(countActiveSourceListFilters({ query: '', status: 'error' })).toBe(1);
  });
});

describe('matchesDocumentQuery', () => {
  it('treats a blank query as a match and handles missing optional fields', () => {
    expect(matchesDocumentQuery(doc({ title: null, description: null }), '   ')).toBe(true);
    expect(matchesDocumentQuery(doc({ title: null, description: null }), 'opening')).toBe(true);
    expect(matchesDocumentQuery(doc({ name: 'x', title: null, description: null }), 'zzz')).toBe(false);
  });
});

describe('filterUploadDocumentsList', () => {
  it('still excludes text and Q&A sources from the Document tab', () => {
    const upload = doc({ id: 'u', name: 'guide.pdf', title: 'Guide', mimeType: 'application/pdf', sourceLabel: 'manual-uploads' });
    const text = doc({ id: 't', sourceLabel: 'text' });
    const qa = doc({ id: 'q', sourceLabel: 'qa_pairs' });
    expect(
      filterUploadDocumentsList([upload, text, qa], { query: '', type: 'all', status: 'all' }),
    ).toEqual([upload]);
  });
});
