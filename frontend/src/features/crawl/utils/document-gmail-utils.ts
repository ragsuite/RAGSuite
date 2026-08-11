import type { CrawlDocument } from '@/features/crawl/types/crawl.types';

export function isGmailDocument(doc: Pick<CrawlDocument, 'sourceLabel'>): boolean {
  return String(doc.sourceLabel ?? '').trim().toLowerCase() === 'gmail';
}

export function filterUploadDocuments(documents: CrawlDocument[]): CrawlDocument[] {
  return documents.filter((doc) => !isGmailDocument(doc));
}

export function filterGmailDocuments(documents: CrawlDocument[]): CrawlDocument[] {
  return documents.filter(isGmailDocument);
}

export function computeUploadDocumentStats(documents: CrawlDocument[]) {
  const uploadDocs = filterUploadDocuments(documents);
  const total = uploadDocs.length;
  let indexed = 0;
  let chunks = 0;
  for (const doc of uploadDocs) {
    chunks += doc.chunksCount;
    if (doc.status === 'indexed') indexed += 1;
  }
  return { total, indexed, chunks };
}
