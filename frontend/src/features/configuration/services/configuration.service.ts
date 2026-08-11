import type {
  ApiKey,
  CreateApiKeyPayload,
  CreateApiKeyResult,
} from '@/features/configuration/types/configuration.types';
import {
  mapApiKeyResponse,
  mapApiKeysListResponse,
  mapN8nInboundTemplateResponse,
  mapN8nRetrieveTestResponse,
  mapRevealApiKeyResponse,
  type N8nInboundTemplate,
  type N8nRetrieveTestResult,
} from '@/features/configuration/utils/configuration-api-mappers';
import { API_CONFIG } from '@/network/apiUrl';
import {
  handleCreateApiKey,
  handleDeleteApiKey,
  handleGetApiKeys,
  handleGetN8nInboundTemplate,
  handleRevealApiKey,
  handleTestN8nRetrieve,
  handleTestRetrieval,
} from '@/network/actions/configuration.actions';

export const CONFIGURATION_API = {
  keys: API_CONFIG.API_KEYS,
  key: API_CONFIG.apiKey,
  keyReveal: API_CONFIG.apiKeyReveal,
  testRetrieve: API_CONFIG.TEST_RETRIEVE,
  n8nInboundTemplate: API_CONFIG.N8N_INBOUND_TEMPLATE,
  n8nRetrieveTest: API_CONFIG.N8N_RETRIEVE_TEST,
} as const;

export type { N8nInboundTemplate, N8nRetrieveTestResult };

export async function fetchApiKeys(projectId?: string | null): Promise<ApiKey[]> {
  const body = await handleGetApiKeys(projectId);
  return mapApiKeysListResponse(body);
}

export async function createApiKey(payload: CreateApiKeyPayload): Promise<CreateApiKeyResult> {
  const body = await handleCreateApiKey(payload);
  const key = mapApiKeyResponse(body);
  const fullKey = key.secretKey ?? (await revealApiKey(key.id));
  return {
    key: { ...key, secretKey: fullKey },
    fullKey,
  };
}

export async function deleteApiKey(id: string): Promise<void> {
  await handleDeleteApiKey(id);
}

export async function revealApiKey(id: string): Promise<string> {
  const body = await handleRevealApiKey(id);
  return mapRevealApiKeyResponse(body);
}

export async function fetchN8nInboundTemplate(projectId: string): Promise<N8nInboundTemplate> {
  const body = await handleGetN8nInboundTemplate(projectId);
  return mapN8nInboundTemplateResponse(body);
}

export async function testN8nRetrieve(projectId: string, query?: string): Promise<N8nRetrieveTestResult> {
  const body = await handleTestN8nRetrieve(projectId, query);
  return mapN8nRetrieveTestResponse(body);
}

export async function testRetrieval(apiKey: string): Promise<{ success: boolean; message: string }> {
  await handleTestRetrieval(apiKey, {
    query: 'test query',
    top_k: 3,
    use_reranker: false,
  });
  return { success: true, message: 'Retrieval test succeeded.' };
}
