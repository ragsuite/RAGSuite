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

/** Ensure (auto-create) the active project's mobile SDK key. */
export async function ensureMobileApiKey(): Promise<MobileApiKeyResponse> {
  return get<MobileApiKeyResponse>(API_CONFIG.MOBILE_API_KEY);
}

/** Regenerate mobile key — previous keys for the project are deactivated immediately. */
export async function regenerateMobileApiKey(): Promise<MobileApiKeyResponse> {
  return post<MobileApiKeyResponse>(API_CONFIG.MOBILE_API_KEY_REGENERATE, {});
}

/** Reveal the full active mobile key secret. */
export async function revealMobileApiKey(): Promise<string> {
  const data = await get<{ key?: string }>(API_CONFIG.MOBILE_API_KEY_REVEAL);
  const key = typeof data?.key === 'string' ? data.key.trim() : '';
  if (!key) throw new Error('Mobile API key secret is not available.');
  return key;
}
