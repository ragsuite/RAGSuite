import type { CrawlDocument, DocumentFilters } from '@/features/crawl/types/crawl.types';
import { isDocumentIngestInFlight } from '@/features/crawl/utils/crawl-document-status';
import { isGmailDocument } from '@/features/crawl/utils/document-gmail-utils';
import { isTextualSourceDocument } from '@/features/crawl/utils/textual-sources';

/** Search + status filters for tabs without a file-type dimension (Text, Q&A Pairs). */
export type SourceListFilters = Pick<DocumentFilters, 'query' | 'status'>;

export const DEFAULT_SOURCE_LIST_FILTERS: SourceListFilters = { query: '', status: 'all' };

export function matchesDocumentStatusFilter(
  status: CrawlDocument['status'],
  filter: DocumentFilters['status'],
): boolean {
  if (filter === 'all') return true;
  if (filter === 'processing') return isDocumentIngestInFlight(status);
  if (filter === 'error') return status === 'failed';
  return status === filter;
}

export function matchesDocumentTypeFilter(doc: CrawlDocument, filter: DocumentFilters['type']): boolean {
  if (filter === 'all') return true;
  const mime = doc.mimeType.toLowerCase();
  const name = (doc.title ?? doc.name).toLowerCase();
  if (filter === 'pdf') return mime.includes('pdf') || name.endsWith('.pdf');
  if (filter === 'doc') {
    return mime.includes('word') || mime.includes('msword') || name.endsWith('.doc') || name.endsWith('.docx');
  }
  if (filter === 'html') {
    return mime.includes('html') || name.endsWith('.html') || name.endsWith('.htm');
  }
  if (filter === 'txt') {
    return mime.includes('text/plain') || mime === 'text/markdown' || name.endsWith('.txt') || name.endsWith('.md');
  }
  return true;
}

export function matchesDocumentQuery(doc: CrawlDocument, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return Boolean(
    doc.name.toLowerCase().includes(needle) ||
      doc.title?.toLowerCase().includes(needle) ||
      doc.mimeType.toLowerCase().includes(needle) ||
      doc.sourceLabel.toLowerCase().includes(needle) ||
      doc.description?.toLowerCase().includes(needle),
  );
}

export function filterUploadDocumentsList(
  documents: CrawlDocument[],
  filters: DocumentFilters,
): CrawlDocument[] {
  return documents.filter((doc) => {
    if (isGmailDocument(doc) || isTextualSourceDocument(doc)) return false;
    return (
      matchesDocumentQuery(doc, filters.query) &&
      matchesDocumentStatusFilter(doc.status, filters.status) &&
      matchesDocumentTypeFilter(doc, filters.type)
    );
  });
}

export function filterSourceList(documents: CrawlDocument[], filters: SourceListFilters): CrawlDocument[] {
  return documents.filter(
    (doc) => matchesDocumentQuery(doc, filters.query) && matchesDocumentStatusFilter(doc.status, filters.status),
  );
}

export function countActiveSourceListFilters(filters: SourceListFilters): number {
  return filters.status === 'all' ? 0 : 1;
}
