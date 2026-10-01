import type {
  CrawlJobUrlEntry,
  CrawlJobUrlsPage,
  CrawlJobUrlsQuery,
} from '@/features/crawl/types/crawl.types';
import { mapUrlEntry } from '@/features/crawl/utils/crawl-api-mappers';
import { handleGetCrawlStatusUrls } from '@/network/actions/crawl.actions';

/** URL rows per list in the job detail response and per "Load more" page. */
export const CRAWL_JOB_URL_PAGE_SIZE = 100;

export function mapCrawlJobUrlsPage(body: unknown, includeStatusCode: boolean): CrawlJobUrlsPage {
  if (!body || typeof body !== 'object') {
    throw new Error('errors.crawl.jobStatusFailed');
  }
  const record = body as { items?: unknown; total?: unknown };
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const items = rawItems
    .map((item) => {
      if (typeof item === 'string') return { url: item };
      if (!item || typeof item !== 'object') return null;
      return mapUrlEntry(item as Record<string, unknown>, includeStatusCode);
    })
    .filter((item): item is CrawlJobUrlEntry => item != null);
  const total = typeof record.total === 'number' ? record.total : items.length;
  return { items, total };
}

export async function fetchCrawlJobUrlsPage(
  jobId: string,
  query: CrawlJobUrlsQuery,
): Promise<CrawlJobUrlsPage> {
  const body = await handleGetCrawlStatusUrls(jobId, query);
  return mapCrawlJobUrlsPage(body, query.kind === 'failed');
}
