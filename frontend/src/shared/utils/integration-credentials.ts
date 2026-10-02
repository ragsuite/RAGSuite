import type { IntegrationsEmbedCache } from '@/features/search-config/utils/search-api-mappers';

export type IntegrationCredentials = {
  projectId: string | null;
  apiEndpoint: string;
  embedToken?: string;
  /** Full or masked mobile API key for SDK snippets. */
  mobileApiKey?: string | null;
  mobileApiKeyMasked?: string | null;
  mobileApiKeyPlaceholder: string;
};

export const MOBILE_API_KEY_PLACEHOLDER = 'rgs_live_YOUR_MOBILE_KEY';

export function buildIntegrationCredentials(
  projectId: string | null,
  apiEndpoint: string,
  embed?: IntegrationsEmbedCache | null,
  mobile?: { apiKey?: string | null; maskedKey?: string | null } | null,
): IntegrationCredentials {
  const apiKey = mobile?.apiKey?.trim() || null;
  const masked = mobile?.maskedKey?.trim() || null;
  return {
    projectId,
    apiEndpoint,
    embedToken: embed?.embedToken,
    mobileApiKey: apiKey,
    mobileApiKeyMasked: masked,
    mobileApiKeyPlaceholder: apiKey || masked || MOBILE_API_KEY_PLACEHOLDER,
  };
}

export function maskSecret(value: string, visibleStart = 8, visibleEnd = 4): string {
  if (value.length <= visibleStart + visibleEnd + 3) return value;
  return `${value.slice(0, visibleStart)}…${value.slice(-visibleEnd)}`;
}
