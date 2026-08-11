import type {
  ApiKey,
  ApiKeyEnvironment,
  ApiKeyExpiration,
  CreateApiKeyPayload,
} from '@/features/configuration/types/configuration.types';

const ENVIRONMENT_TO_API: Record<ApiKeyEnvironment, string> = {
  production: 'Production',
  staging: 'Staging',
  development: 'Development',
};

const EXPIRATION_TO_API: Record<ApiKeyExpiration, string> = {
  never: 'Never expires',
  '30d': '30 days',
  '90d': '90 days',
  '1y': '1 year',
};

function normalizeEnvironment(value: unknown): ApiKeyEnvironment {
  const raw = String(value ?? 'development').toLowerCase();
  if (raw === 'production' || raw === 'prod') return 'production';
  if (raw === 'staging' || raw === 'stage') return 'staging';
  return 'development';
}

function unwrapRecord(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (record.data && typeof record.data === 'object') {
    return record.data as Record<string, unknown>;
  }
  return record;
}

export function mapCreateApiKeyPayloadToApi(payload: CreateApiKeyPayload): Record<string, unknown> {
  return {
    name: payload.name.trim(),
    description: payload.description.trim() || null,
    environment: ENVIRONMENT_TO_API[payload.environment] ?? 'Development',
    rate_limit: 100,
    expiration: EXPIRATION_TO_API[payload.expiration] ?? 'Never expires',
  };
}

export function mapApiKeyResponse(body: unknown): ApiKey {
  const data = unwrapRecord(body);
  if (!data) throw new Error('errors.apiKeys.invalidResponse');

  const preview =
    (typeof data.key_preview === 'string' && data.key_preview) ||
    (typeof data.masked_key === 'string' && data.masked_key) ||
    '';

  const fullKey = typeof data.key === 'string' ? data.key : typeof data.full_key === 'string' ? data.full_key : undefined;

  return {
    id: String(data.id ?? ''),
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    maskedKey: preview || (fullKey ? maskKeyPreview(fullKey) : '—'),
    secretKey: fullKey && !fullKey.includes('...') ? fullKey : undefined,
    environment: normalizeEnvironment(data.environment),
    createdAt: typeof data.created_at === 'string' ? data.created_at : new Date().toISOString(),
    lastUsedAt: typeof data.last_used_at === 'string' ? data.last_used_at : null,
    requestCount: typeof data.request_count === 'number' ? data.request_count : 0,
    expiresAt: typeof data.expires_at === 'string' ? data.expires_at : null,
  };
}

export function mapApiKeysListResponse(body: unknown): ApiKey[] {
  if (Array.isArray(body)) {
    return body.map(mapApiKeyResponse);
  }
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown[] }).data)) {
    return (body as { data: unknown[] }).data.map(mapApiKeyResponse);
  }
  return [];
}

export function mapRevealApiKeyResponse(body: unknown): string {
  const data = unwrapRecord(body);
  const key = typeof data?.key === 'string' ? data.key.trim() : '';
  if (!key) throw new Error('errors.apiKeys.revealFailed');
  return key;
}

export function maskKeyPreview(fullKey: string): string {
  if (fullKey.length <= 16) return fullKey;
  return `${fullKey.slice(0, 12)}...${fullKey.slice(-4)}`;
}

export type N8nInboundTemplate = {
  retrieveUrl: string;
  searchUrl: string;
  bodyExample: Record<string, unknown>;
  curlRetrieve: string;
  curlSearch: string;
};

export function mapN8nInboundTemplateResponse(body: unknown): N8nInboundTemplate {
  const data = unwrapRecord(body) ?? {};
  const bodyExample =
    data.body_example && typeof data.body_example === 'object'
      ? (data.body_example as Record<string, unknown>)
      : {
          query: 'What is our refund policy?',
          top_k: 5,
          use_reranker: false,
        };

  return {
    retrieveUrl: typeof data.retrieve_url === 'string' ? data.retrieve_url : '/api/v1/retrieve',
    searchUrl: typeof data.search_url === 'string' ? data.search_url : '/api/v1/search',
    bodyExample,
    curlRetrieve: typeof data.curl_retrieve === 'string' ? data.curl_retrieve : '',
    curlSearch: typeof data.curl_search === 'string' ? data.curl_search : '',
  };
}

export type N8nRetrieveTestResult = {
  success: boolean;
  message: string;
  resultCount: number;
};

export function mapN8nRetrieveTestResponse(body: unknown): N8nRetrieveTestResult {
  const data = unwrapRecord(body) ?? {};
  return {
    success: Boolean(data.success),
    message: typeof data.message === 'string' ? data.message : data.success ? 'Retrieve OK' : 'Retrieve failed',
    resultCount: typeof data.result_count === 'number' ? data.result_count : 0,
  };
}
