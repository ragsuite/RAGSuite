import { API_CONFIG } from '@/network/apiUrl';
import { get, post } from '@/network/request';

import type {
  EmbeddingSource,
  EmbeddingStatus,
  ReindexOptions,
  ReindexProgress,
} from '@/features/search-config/types/embedding.types';

function withSourceQuery(path: string, source: EmbeddingSource): string {
  return `${path}?source=${encodeURIComponent(source)}`;
}

export async function handleGetProjectEmbeddingStatus(
  projectId: string,
  source: EmbeddingSource = 'search',
): Promise<unknown> {
  return get(withSourceQuery(API_CONFIG.projectEmbeddingStatus(projectId), source));
}

export async function handlePostProjectReindex(
  projectId: string,
  source: EmbeddingSource = 'search',
  opts?: ReindexOptions,
): Promise<unknown> {
  const params = new URLSearchParams({ source });
  if (opts?.includeCrawled === false) {
    params.set('include_crawled', 'false');
  }
  const body: { document_ids?: string[] } = {};
  if (opts?.documentIds?.length) {
    body.document_ids = opts.documentIds;
  }
  return post(`${API_CONFIG.projectReindex(projectId)}?${params.toString()}`, body);
}

export async function handleGetProjectReindexProgress(
  projectId: string,
  source: EmbeddingSource = 'search',
): Promise<unknown> {
  return get(withSourceQuery(API_CONFIG.projectReindexProgress(projectId), source));
}

export async function handleGetProjectEmbeddingItemCoverage(
  projectId: string,
  source: EmbeddingSource = 'chat',
  opts?: { skipCache?: boolean },
): Promise<unknown> {
  const params = new URLSearchParams({ source });
  if (opts?.skipCache) {
    params.set('skip_cache', 'true');
  }
  // Coverage can be slow under large indexes; do not flash global "Can't reach the server".
  return get(`${API_CONFIG.projectEmbeddingItemCoverage(projectId)}?${params.toString()}`, {
    skipReachability: true,
    timeout: 60_000,
  });
}
