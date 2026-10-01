import type { CrawlBundle, CrawlDocument, DocumentStatus } from '@/features/crawl/types/crawl.types';

export function isDocumentIngestInFlight(status: DocumentStatus): boolean {
  return status === 'queued' || status === 'extracting' || status === 'indexing';
}

/** Upload ingest in flight, or a retrain queued/running on an already trained document. */
export function isDocumentTrainingActive(doc: Pick<CrawlDocument, 'status' | 'trainingProgress'>): boolean {
  return isDocumentIngestInFlight(doc.status) || doc.trainingProgress != null;
}

export function bundleHasProcessingDocuments(bundle: CrawlBundle | null): boolean {
  if (!bundle) return false;
  return bundle.documents.some(isDocumentTrainingActive);
}
