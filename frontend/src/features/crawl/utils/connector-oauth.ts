import { API_CONFIG } from '@/network/apiUrl';

const API_V1_PREFIX = '/api/v1';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizeApiV1Path(pathname: string): string {
  const normalized = stripTrailingSlash(pathname || '');
  if (!normalized || normalized === '/') return API_V1_PREFIX;
  if (normalized.endsWith(API_V1_PREFIX)) return normalized;
  return `${normalized}${API_V1_PREFIX}`;
}

function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h === '127.0.0.1';
}

export function isLikelyBlockedOAuthRedirectHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (!h || isLoopbackHost(h)) return false;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  return false;
}

export function normalizeApiBaseToV1(baseUrl: string): string {
  const trimmed = stripTrailingSlash(baseUrl.trim());
  try {
    const parsed = new URL(trimmed);
    parsed.pathname = normalizeApiV1Path(parsed.pathname);
    parsed.search = '';
    parsed.hash = '';
    return stripTrailingSlash(parsed.toString());
  } catch {
    if (trimmed.endsWith(API_V1_PREFIX)) return trimmed;
    return `${trimmed}${API_V1_PREFIX}`;
  }
}

export function resolveConnectorOAuthApiBase(): string {
  const detectedBase = normalizeApiBaseToV1(API_CONFIG.BASE_URL);
  if (typeof window === 'undefined') {
    return detectedBase;
  }

  try {
    const parsed = new URL(detectedBase);
    if (isLoopbackHost(window.location.hostname) && isLikelyBlockedOAuthRedirectHost(parsed.hostname)) {
      return normalizeApiBaseToV1(window.location.origin);
    }
  } catch {
    /* ignore and fall back to detected base */
  }

  return detectedBase;
}

export function buildConnectorOAuthRedirectUri(connectorSlug: string): string {
  const base = resolveConnectorOAuthApiBase();
  return `${base}/connectors/${connectorSlug}/auth/callback`;
}

function fixTruncatedConnectorCallbackPath(uri: string, connectorSlug: string): string {
  const trimmed = uri.trim();
  const expectedPath = `/api/v1/connectors/${connectorSlug}/auth/callback`;
  try {
    const parsed = new URL(trimmed);
    const noTrail = parsed.pathname.replace(/\/+$/, '');
    if (noTrail === expectedPath) return trimmed;
    if (
      noTrail === `/connectors/${connectorSlug}/auth/callback` ||
      new RegExp(`/connectors/${connectorSlug}/auth$`).test(noTrail) ||
      new RegExp(`/connectors/${connectorSlug}/callback$`).test(noTrail)
    ) {
      parsed.pathname = expectedPath;
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    /* ignore and return raw trimmed value */
  }
  return trimmed.replace(/\/+$/, '');
}

/** Shared OAuth redirect helpers for `/connectors/{slug}/auth/callback` routes. */
export function createConnectorOAuthHelpers(connectorSlug: string) {
  function getOAuthRedirectUri(): string {
    return buildConnectorOAuthRedirectUri(connectorSlug);
  }

  function coerceSavedRedirectUri(saved?: string | null): string {
    const detected = getOAuthRedirectUri();
    if (!saved?.trim()) return detected;
    let uri = fixTruncatedConnectorCallbackPath(saved, connectorSlug);
    if (typeof window !== 'undefined') {
      try {
        const parsed = new URL(uri);
        const detectedUrl = new URL(detected);
        if (parsed.origin !== detectedUrl.origin) {
          return detected;
        }
        const ui = window.location.hostname.toLowerCase();
        const uiLoopback = ui === 'localhost' || ui === '127.0.0.1';
        if (uiLoopback && isLikelyBlockedOAuthRedirectHost(parsed.hostname)) {
          return detected;
        }
      } catch {
        return detected;
      }
    }
    return uri;
  }

  return { getOAuthRedirectUri, coerceSavedRedirectUri };
}
