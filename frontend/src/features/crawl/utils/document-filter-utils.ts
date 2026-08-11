import type { CrawlDocument, DocumentFilters } from '@/features/crawl/types/crawl.types';
import { isDocumentIngestInFlight } from '@/features/crawl/utils/crawl-document-status';
import { isGmailDocument } from '@/features/crawl/utils/document-gmail-utils';

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

export function filterUploadDocumentsList(
  documents: CrawlDocument[],
  filters: DocumentFilters,
): CrawlDocument[] {
  const query = filters.query.trim().toLowerCase();
  return documents.filter((doc) => {
    if (isGmailDocument(doc)) return false;
    const matchesQuery =
      !query ||
      doc.name.toLowerCase().includes(query) ||
      doc.title?.toLowerCase().includes(query) ||
      doc.mimeType.toLowerCase().includes(query) ||
      doc.sourceLabel.toLowerCase().includes(query) ||
      doc.description?.toLowerCase().includes(query);
    return (
      matchesQuery &&
      matchesDocumentStatusFilter(doc.status, filters.status) &&
      matchesDocumentTypeFilter(doc, filters.type)
    );
  });
}
