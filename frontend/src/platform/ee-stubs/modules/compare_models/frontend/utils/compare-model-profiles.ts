import { unwrapSearchApiData } from '@/features/search-config/utils/search-api-mappers';

export type SearchModelProfileApi = {
  id: string;
  provider: string;
  model_name: string;
  api_key?: string;
  embedding_model?: string | null;
  compare_enabled?: boolean;
  is_runtime_config?: boolean;
  provider_key?: string | null;
  extra_params?: { max_tokens?: number };
};

export type CompareProfileSource = 'providers' | 'chat' | 'search' | 'both' | 'auto';

export type SearchModelProfilesListResponse = {
  configured_source: CompareProfileSource;
  effective_source: CompareProfileSource;
  profiles: SearchModelProfileApi[];
};

export function parseSearchModelProfilesResponse(body: unknown): SearchModelProfilesListResponse | null {
  const data = unwrapSearchApiData(body) ?? body;
  if (Array.isArray(data)) {
    return {
      configured_source: 'search',
      effective_source: 'search',
      profiles: data as SearchModelProfileApi[],
    };
  }
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const profiles = Array.isArray(record.profiles) ? (record.profiles as SearchModelProfileApi[]) : [];
  return {
    configured_source: (record.configured_source as CompareProfileSource) ?? 'search',
    effective_source: (record.effective_source as CompareProfileSource) ?? 'search',
    profiles,
  };
}
