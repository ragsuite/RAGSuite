import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import type { SourceAnswersLockReason } from '@/features/crawl/utils/crawl.utils';
import { isDocumentTrainingActive } from '@/features/crawl/utils/crawl-document-status';

export function documentUsedInAnswers(doc: Pick<CrawlDocument, 'useInAnswers'>): boolean {
  return doc.useInAnswers !== false;
}

type DocumentAnswersLockInput = Pick<CrawlDocument, 'status' | 'trainingProgress' | 'chunksCount'>;

/** Same rules as crawl sources: locked while training, and until something was trained. */
export function documentAnswersLockReason(doc: DocumentAnswersLockInput): SourceAnswersLockReason | null {
  if (isDocumentTrainingActive(doc)) return 'running';
  if (!(doc.chunksCount > 0)) return 'empty';
  return null;
}
