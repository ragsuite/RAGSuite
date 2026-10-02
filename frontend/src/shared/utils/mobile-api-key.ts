import { API_CONFIG } from '@/network/apiUrl';
import { get, post } from '@/network/request';

export type MobileApiKeyResponse = {
  id: string;
  project_id: string;
  name: string;
  masked_key: string;
  is_active: boolean;
  created_at?: string;
  last_used_at?: string | null;
  request_count?: number;
  secret?: string | null;
};

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** Ensure (auto-create) the active project's mobile SDK key. */
export async function ensureMobileApiKey(): Promise<MobileApiKeyResponse> {
  const body = await get<MobileApiKeyResponse>(API_CONFIG.MOBILE_API_KEY);
  return unwrapBody<MobileApiKeyResponse>(body);
}

/** Regenerate mobile key — previous keys for the project are deactivated immediately. */
export async function regenerateMobileApiKey(): Promise<MobileApiKeyResponse> {
  const body = await post<Record<string, never>, MobileApiKeyResponse>(
    API_CONFIG.MOBILE_API_KEY_REGENERATE,
    {},
  );
  return unwrapBody<MobileApiKeyResponse>(body);
}

/** Reveal the full active mobile key secret. */
export async function revealMobileApiKey(): Promise<string> {
  const body = await get<{ key?: string }>(API_CONFIG.MOBILE_API_KEY_REVEAL);
  const data = unwrapBody<{ key?: string }>(body);
  const key = typeof data?.key === 'string' ? data.key.trim() : '';
  if (!key) throw new Error('Mobile API key secret is not available.');
  return key;
}
