import type { CreateApiKeyPayload } from '@/features/configuration/types/configuration.types';
import { mapCreateApiKeyPayloadToApi } from '@/features/configuration/utils/configuration-api-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post } from '@/network/request';

export async function handleGetApiKeys(projectId?: string | null): Promise<unknown> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
  return get(`${API_CONFIG.API_KEYS}${query}`);
}

export async function handleCreateApiKey(payload: CreateApiKeyPayload): Promise<unknown> {
  return post(API_CONFIG.API_KEYS, mapCreateApiKeyPayloadToApi(payload));
}

export async function handleDeleteApiKey(id: string): Promise<void> {
  await deleteApi(API_CONFIG.apiKey(id));
}

export async function handleRevealApiKey(id: string): Promise<unknown> {
  return get(API_CONFIG.apiKeyReveal(id));
}

export async function handleGetN8nInboundTemplate(projectId: string): Promise<unknown> {
  return get(`${API_CONFIG.N8N_INBOUND_TEMPLATE}?project_id=${encodeURIComponent(projectId)}`);
}

export async function handleTestN8nRetrieve(
  projectId: string,
  query = 'test connection',
): Promise<unknown> {
  return post(API_CONFIG.N8N_RETRIEVE_TEST, {
    project_id: projectId,
    query,
    top_k: 3,
  });
}

export async function handleTestRetrieval(
  apiKey: string,
  body: { query: string; top_k: number; use_reranker: boolean },
): Promise<unknown> {
  return post(API_CONFIG.TEST_RETRIEVE, body, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    skipAuth: true,
  });
}
