import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, fetchWithAuth, get, patch, post } from '@/network/request';

export type CompareProfileApi = {
  id: string;
  provider: string;
  model_name: string;
  api_key: string;
  embedding_model: string | null;
  compare_enabled: boolean;
  extra_params?: {
    max_tokens?: number;
  };
};

export type CompareConfigsApiResponse = {
  configured_source: 'chat' | 'search';
  effective_source: 'chat' | 'search';
  profiles: CompareProfileApi[];
};

function isErrorWithStatus(error: unknown, status: number): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: number }).status === status,
  );
}

function normalizeCompareProfiles(payload: unknown): CompareProfileApi[] {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const rows = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.profiles)
      ? record.profiles
      : Array.isArray(payload)
        ? payload
        : [];
  return rows as CompareProfileApi[];
}

export async function handleGetCompareModelConfigs(): Promise<CompareConfigsApiResponse> {
  try {
    return (await get<CompareConfigsApiResponse>(API_CONFIG.COMPARE_MODEL_CONFIGS)) as CompareConfigsApiResponse;
  } catch (error) {
    if (!isErrorWithStatus(error, 404)) throw error;
    const fallback = await get<unknown>(API_CONFIG.SEARCH_MODEL_PROFILES);
    return {
      configured_source: 'search',
      effective_source: 'search',
      profiles: normalizeCompareProfiles(fallback),
    };
  }
}

export async function handleUpdateCompareModelConfig(
  id: string,
  body: { compare_enabled: boolean },
): Promise<void> {
  try {
    await patch(API_CONFIG.compareModelConfig(id), body);
  } catch (error) {
    if (!isErrorWithStatus(error, 404)) throw error;
    await patch(API_CONFIG.searchModelProfile(id), body);
  }
}

export async function handleDeleteCompareModelConfig(id: string): Promise<void> {
  try {
    await deleteApi(API_CONFIG.compareModelConfig(id));
  } catch (error) {
    if (!isErrorWithStatus(error, 404)) throw error;
    await deleteApi(API_CONFIG.searchModelProfile(id));
  }
}

export async function handleRunCompareModelsStream(body: { query: string }): Promise<Response> {
  const run = (path: string) =>
    fetchWithAuth(path, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(body),
    });

  let response = await run(API_CONFIG.COMPARE_MODELS_RUN);
  if (response.status !== 404) {
    return response;
  }

  response = await run(API_CONFIG.SEARCH_COMPARE_STREAM);
  if (response.status !== 404) {
    return response;
  }

  return fetchWithAuth(API_CONFIG.SEARCH_COMPARE, {
    method: 'POST',
    headers: {
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(body),
  });
}
