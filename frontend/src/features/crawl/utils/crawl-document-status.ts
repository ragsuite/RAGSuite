import type { CrawlBundle, DocumentStatus } from '@/features/crawl/types/crawl.types';

export function isDocumentIngestInFlight(status: DocumentStatus): boolean {
  return status === 'queued' || status === 'extracting' || status === 'indexing';
}

export function bundleHasProcessingDocuments(bundle: CrawlBundle | null): boolean {
  if (!bundle) return false;
  return bundle.documents.some((doc) => isDocumentIngestInFlight(doc.status));
}
