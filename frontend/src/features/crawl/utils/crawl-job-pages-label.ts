import type { CrawlJob, CrawlSource } from '@/features/crawl/types/crawl.types';
import { isPipelineInFlight } from '@/features/crawl/utils/crawl-pipeline-status';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function formatCrawlJobPagesLabel(
  source: Pick<CrawlSource, 'documents_count' | 'pipeline_status'>,
  job: Pick<CrawlJob, 'crawledCount'>,
  t: TranslateFn,
): string {
  const indexedCount = source.documents_count;
  const visitedCount = job.crawledCount ?? 0;
  if (isPipelineInFlight(source.pipeline_status)) {
    return t('crawl.jobs.pagesVisitedIndexed', { visited: visitedCount, indexed: indexedCount });
  }
  return t('crawl.jobs.pagesIndexed', { count: indexedCount });
}
