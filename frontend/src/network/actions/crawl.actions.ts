import type { AddSourcePayload } from '@/features/crawl/types/crawl.types';
import { mapAddSourcePayloadToApi } from '@/features/crawl/utils/crawl-api-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, put } from '@/network/request';

export async function handleGetCrawlSites(): Promise<unknown> {
  return get(API_CONFIG.CRAWL_SITES);
}

export async function handleAddCrawlSite(body: AddSourcePayload): Promise<unknown> {
  return post(API_CONFIG.CRAWL_SITES, mapAddSourcePayloadToApi(body));
}

export async function handleUpdateCrawlSite(siteId: string, body: AddSourcePayload): Promise<unknown> {
  return put(API_CONFIG.crawlSite(siteId), mapAddSourcePayloadToApi(body));
}

export async function handleDeleteCrawlSite(siteId: string): Promise<unknown> {
  return deleteApi(API_CONFIG.crawlSite(siteId));
}

export async function handleStartCrawl(siteId: string): Promise<unknown> {
  return post(API_CONFIG.crawlStart(siteId));
}

export async function handleGetCrawlStatus(jobId: string): Promise<unknown> {
  return get(API_CONFIG.crawlStatus(jobId));
}

export async function handlePreviewCrawlUrl(url: string): Promise<unknown> {
  return put(API_CONFIG.CRAWL_PREVIEW, { url });
}
