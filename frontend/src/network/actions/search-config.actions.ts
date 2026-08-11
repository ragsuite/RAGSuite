import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, fetchWithAuth, get, post, put } from '@/network/request';

import type {
  ChatConfigUpdate,
  CitationFormattingUpdate,
  CompareSearchRequest,
  ModelConfigProfileCreate,
  ModelConfigProfileUpdate,
  PromptUpdateRequest,
  RagQueryRequest,
  ResponseConfigUpdate,
  SearchActivateRequest,
  SearchApiQueryParams,
  SearchConfigurationUpdate,
  SearchCustomizationUpdate,
  SearchFeedbackRequest,
  SearchHistoryQueryParams,
  SearchModelConfigUpdate,
  SearchSessionDeleteParams,
  TestSearchConfigRequest,
} from '@/features/search-config/types/search-api.types';
import {
  parseSearchHistoryRowsResponse,
  unwrapSearchApiData,
} from '@/features/search-config/utils/search-api-mappers';
import type { SearchHistoryEntry } from '@/features/search-config/types/search-config.types';

function appendProjectId(search: URLSearchParams, projectId?: string | null) {
  if (projectId?.trim()) {
    search.set('project_id', projectId.trim());
  }
}

function withProjectQuery(path: string, params: SearchApiQueryParams = {}): string {
  const search = new URLSearchParams();
  appendProjectId(search, params.projectId);
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

// —— Prompt (scoped to active project via auth — no project_id query) ——

export async function handleGetSearchPrompt(): Promise<unknown> {
  return get(API_CONFIG.SEARCH_PROMPT);
}

export async function handleSaveSearchPrompt(body: PromptUpdateRequest): Promise<unknown> {
  return post(API_CONFIG.SEARCH_PROMPT, body);
}

export async function handlePutSearchPrompt(body: PromptUpdateRequest): Promise<unknown> {
  return put(API_CONFIG.SEARCH_PROMPT, body);
}

/** POST is the primary write path; fall back to PUT for older API builds. */
export async function handleUpsertSearchPrompt(body: PromptUpdateRequest): Promise<unknown> {
  try {
    return await post(API_CONFIG.SEARCH_PROMPT, body);
  } catch (error) {
    try {
      return await put(API_CONFIG.SEARCH_PROMPT, body);
    } catch {
      throw error;
    }
  }
}

// —— Response config ——

export async function handleGetSearchResponseConfig(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_RESPONSE_CONFIG, params));
}

export async function handleUpdateSearchResponseConfig(body: ResponseConfigUpdate): Promise<unknown> {
  return post(API_CONFIG.SEARCH_RESPONSE_CONFIG, body);
}

// —— RAG settings ——

export async function handleGetRagSettings(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.RAG_SETTINGS, params));
}

// —— Search query ——

export async function handlePostSearch(
  body: RagQueryRequest,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH, params), body);
}

export async function handlePostSearchQuery(
  body: RagQueryRequest,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_QUERY, params), body);
}

export async function handlePostSearchStream(
  body: RagQueryRequest | Record<string, unknown>,
  params: SearchApiQueryParams = {},
): Promise<Response> {
  return fetchWithAuth(withProjectQuery(API_CONFIG.SEARCH_STREAM, params), {
    method: 'POST',
    headers: { Accept: 'text/event-stream' },
    body: JSON.stringify(body),
  });
}

export async function handlePostSearchCompare(
  body: CompareSearchRequest,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  // Multi-model compare (retrieve + mistral + ollama) routinely exceeds the
  // default 30s axios timeout and surfaces as opaque "Failed to fetch".
  return post(withProjectQuery(API_CONFIG.SEARCH_COMPARE, params), body, {
    timeout: 300_000,
  });
}

export async function handlePostSearchCompareStream(
  body: CompareSearchRequest,
  params: SearchApiQueryParams = {},
): Promise<Response> {
  return fetchWithAuth(withProjectQuery(API_CONFIG.SEARCH_COMPARE_STREAM, params), {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

// —— History & sessions ——

function buildSearchHistoryQuery(params: SearchHistoryQueryParams): string {
  const search = new URLSearchParams();
  appendProjectId(search, params.projectId);
  if (params.sessionId?.trim()) search.set('session_id', params.sessionId.trim());
  if (params.limit != null) search.set('limit', String(params.limit));
  if (params.source) search.set('source', params.source);
  if (params.grouped != null) search.set('grouped', String(params.grouped));
  return `${API_CONFIG.SEARCH_HISTORY}?${search.toString()}`;
}

export async function handleGetSearchHistory(params: SearchHistoryQueryParams = {}): Promise<SearchHistoryEntry[]> {
  const response = await get<unknown>(buildSearchHistoryQuery({ limit: 50, source: 'page', ...params }));
  const rows = parseSearchHistoryRowsResponse(response);
  if (!rows) throw new Error('errors.search.invalidHistoryResponse');
  return rows;
}

export async function handleGetSearchSessions(): Promise<unknown> {
  return get(API_CONFIG.SEARCH_SESSIONS);
}

export async function handleClearSearchSession(
  sessionId: string,
  params: SearchSessionDeleteParams = {},
): Promise<unknown> {
  const search = new URLSearchParams();
  appendProjectId(search, params.projectId);
  if (params.source) search.set('source', params.source);
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return deleteApi(`${API_CONFIG.searchSession(sessionId)}${suffix}`);
}

// —— Feedback & messages ——

export async function handleSubmitSearchFeedback(
  body: SearchFeedbackRequest,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_FEEDBACK, params), body);
}

export async function handleDeleteSearchMessage(messageId: string): Promise<unknown> {
  return deleteApi(API_CONFIG.searchMessage(messageId));
}

export async function handleDeleteAllSearchMessages(source?: string): Promise<unknown> {
  const search = new URLSearchParams();
  if (source) search.set('source', source);
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return deleteApi(`${API_CONFIG.SEARCH_MESSAGES}${suffix}`);
}

// —— Activation ——

export async function handleGetSearchActivationStatus(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_ACTIVATE, params));
}

export async function handleActivateSearch(
  body?: SearchActivateRequest,
  params: SearchApiQueryParams & { isActive?: boolean | null } = {},
): Promise<unknown> {
  const search = new URLSearchParams();
  appendProjectId(search, params.projectId);
  if (params.isActive != null) search.set('is_active', String(params.isActive));
  const suffix = search.size > 0 ? `?${search.toString()}` : '';
  return put(`${API_CONFIG.SEARCH_ACTIVATE}${suffix}`, body);
}

// —— Models ——

export async function handleGetSearchModelConfig(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_MODELS, params));
}

export async function handleUpdateSearchModelConfig(
  body: SearchModelConfigUpdate | ChatConfigUpdate,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_MODELS, params), body);
}

export async function handleTestSearchModelConfig(
  body: TestSearchConfigRequest,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_MODELS_TEST, params), body, { timeout: 15_000 });
}

export async function handleGetAvailableSearchModels(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_MODELS_AVAILABLE, params));
}

// —— Configuration & customization ——

export async function handleGetSearchConfiguration(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_CONFIGURATION, params));
}

export async function handleUpdateSearchConfiguration(
  body: SearchConfigurationUpdate,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_CONFIGURATION, params), body);
}

export async function handleGetSearchCustomization(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_CUSTOMIZATION, params));
}

export async function handleUpdateSearchCustomization(
  body: SearchCustomizationUpdate,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_CUSTOMIZATION, params), body);
}

// —— Model profiles ——

export async function handleListSearchModelProfiles(
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_MODEL_PROFILES, params));
}

export async function handleUpsertSearchModelProfile(body: ModelConfigProfileCreate): Promise<unknown> {
  return post(API_CONFIG.SEARCH_MODEL_PROFILES, body);
}

export async function handleUpdateSearchModelProfile(
  profileId: string,
  body: ModelConfigProfileUpdate,
): Promise<unknown> {
  return put(API_CONFIG.searchModelProfile(profileId), body);
}

export async function handleDeleteSearchModelProfile(profileId: string): Promise<unknown> {
  return deleteApi(API_CONFIG.searchModelProfile(profileId));
}

// —— Citation ——

export async function handleGetSearchCitation(params: SearchApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.SEARCH_CITATION, params));
}

export async function handleUpdateSearchCitation(
  body: CitationFormattingUpdate,
  params: SearchApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.SEARCH_CITATION, params), body);
}

// —— Widget domains (shared with chatbot) ——

export async function handleGetIntegrationsEmbed(): Promise<unknown> {
  return get(API_CONFIG.INTEGRATIONS_EMBED);
}

export async function handleUpdateIntegrationsEmbed(body: Record<string, unknown>): Promise<unknown> {
  return post(API_CONFIG.INTEGRATIONS_EMBED, body);
}

export async function handleDeleteIntegrationsEmbedKey(keyId: string): Promise<unknown> {
  return deleteApi(API_CONFIG.integrationsEmbedKey(keyId));
}

// —— Config models catalog (reference: GET /config-models/models) ——

export async function handleGetConfigModelsCatalog(): Promise<unknown> {
  return get(API_CONFIG.CONFIG_MODELS_CATALOG);
}

export async function handleGetSearchMessage(messageId: string): Promise<unknown> {
  return get(API_CONFIG.searchMessage(messageId));
}

/** Unwrap `{ data: T }` envelopes from search model/citation endpoints. */
export function parseSearchApiEnvelope<T>(body: unknown): T | null {
  return unwrapSearchApiData<T>(body);
}
