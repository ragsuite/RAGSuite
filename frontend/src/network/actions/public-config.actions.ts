import type {
  PublicAuthConfig,
  PublicAuthConfigResponse,
  SsoDiscoverResponse,
  SsoStartResponse,
} from '@/features/auth/types/public-config.types';
import { rememberSsoProvider } from '@/features/auth/utils/sso-callback';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';
import { get } from '@/network/request';

function mapPublicConfig(raw: PublicAuthConfigResponse): PublicAuthConfig {
  const ssoProviders = Array.isArray(raw.sso_providers)
    ? raw.sso_providers.map((p) => String(p).trim().toLowerCase()).filter(Boolean)
    : [];
  return {
    registrationEnabled: Boolean(raw.registration_enabled),
    ssoEnabled: Boolean(raw.sso_enabled) || ssoProviders.length > 0,
    ssoProviders,
    organizationSlug: raw.organization_slug ?? null,
  };
}

export async function handleGetPublicAuthConfig(): Promise<PublicAuthConfig> {
  const response = (await get<PublicAuthConfigResponse>(API_CONFIG.AUTH_PUBLIC_CONFIG, {
    skipAuth: true,
  })) as PublicAuthConfigResponse;

  if (!response || typeof response !== 'object') {
    throw new Error('errors.auth.publicConfigFailed');
  }

  return mapPublicConfig(response);
}

export async function handleDiscoverSso(email: string): Promise<SsoDiscoverResponse> {
  const query = `?email=${encodeURIComponent(email.trim().toLowerCase())}`;
  return (await get<SsoDiscoverResponse>(`${API_CONFIG.AUTH_SSO_DISCOVER}${query}`, {
    skipAuth: true,
  })) as SsoDiscoverResponse;
}

/** Build SSO start URL (browser redirect fallback). */
export function buildSsoStartUrl(orgSlug: string, provider: string = 'google'): string {
  const params = new URLSearchParams({
    org_slug: orgSlug,
    provider: (provider || 'google').trim().toLowerCase() || 'google',
  });
  return buildApiUrl(`${API_CONFIG.AUTH_SSO_START}?${params.toString()}`);
}

/**
 * Start OIDC via JSON endpoint so ngrok-skip-browser-warning can be sent,
 * then full-page redirect to the IdP authorize URL.
 */
export async function navigateToSsoStart(
  orgSlug: string,
  provider: string = 'google',
): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  rememberSsoProvider(provider);
  const startUrl = buildSsoStartUrl(orgSlug, provider);
  try {
    const response = await fetch(startUrl, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'ngrok-skip-browser-warning': 'true',
      },
    });
    if (!response.ok) {
      throw new Error(`SSO start failed (${response.status})`);
    }
    const payload = (await response.json()) as SsoStartResponse;
    if (!payload?.authorize_url) {
      throw new Error('SSO start returned no authorize URL');
    }
    window.location.assign(payload.authorize_url);
  } catch {
    window.location.assign(startUrl);
  }
}
