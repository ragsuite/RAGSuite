import type { AddSourcePayload, CrawlJobUrlsQuery } from '@/features/crawl/types/crawl.types';
import {
  mapAddSourcePayloadToApi,
  mapUpdateSourcePayloadToApi,
} from '@/features/crawl/utils/crawl-api-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, put } from '@/network/request';

export async function handleGetCrawlSites(): Promise<unknown> {
  return get(API_CONFIG.CRAWL_SITES);
}

export async function handleAddCrawlSite(body: AddSourcePayload): Promise<unknown> {
  return post(API_CONFIG.CRAWL_SITES, mapAddSourcePayloadToApi(body));
}

export async function handleUpdateCrawlSite(siteId: string, body: AddSourcePayload): Promise<unknown> {
  return put(API_CONFIG.crawlSite(siteId), mapUpdateSourcePayloadToApi(body));
}

export async function handleDeleteCrawlSite(siteId: string): Promise<unknown> {
  return deleteApi(API_CONFIG.crawlSite(siteId));
}

export async function handleStartCrawl(siteId: string): Promise<unknown> {
  return post(API_CONFIG.crawlStart(siteId));
}

export async function handleStopCrawl(siteId: string): Promise<unknown> {
  return post(API_CONFIG.crawlStop(siteId));
}

/** `urlLimit` caps each URL list in the response (0 = status/counts only). */
export async function handleGetCrawlStatus(
  jobId: string,
  options?: { urlLimit?: number },
): Promise<unknown> {
  const urlLimit = options?.urlLimit;
  return get(
    API_CONFIG.crawlStatus(jobId),
    urlLimit === undefined ? undefined : { params: { url_limit: urlLimit } },
  );
}

export async function handleGetCrawlStatusUrls(
  jobId: string,
  query: CrawlJobUrlsQuery,
): Promise<unknown> {
  const q = query.q?.trim();
  return get(API_CONFIG.crawlStatusUrls(jobId), {
    params: {
      kind: query.kind,
      offset: query.offset,
      limit: query.limit,
      sort: query.sort,
      ...(q ? { q } : {}),
    },
  });
}

export async function handleGetCrawlEmbeddingTargetOptions(): Promise<unknown> {
  return get(API_CONFIG.CRAWL_EMBEDDING_TARGET_OPTIONS);
}

export async function handlePreviewCrawlUrl(url: string): Promise<unknown> {
  return put(API_CONFIG.CRAWL_PREVIEW, { url });
}
