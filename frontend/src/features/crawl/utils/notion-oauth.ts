import { buildConnectorOAuthRedirectUri, isLikelyBlockedOAuthRedirectHost } from '@/features/crawl/utils/connector-oauth';

function fixTruncatedNotionCallbackPath(uri: string): string {
  const trimmed = uri.trim();
  try {
    const parsed = new URL(trimmed);
    const noTrail = parsed.pathname.replace(/\/+$/, '');
    if (noTrail === '/api/v1/connectors/notion/auth/callback') return trimmed;
    if (
      noTrail === '/connectors/notion/auth/callback' ||
      /\/connectors\/notion\/auth$/.test(noTrail) ||
      /\/connectors\/notion\/callback$/.test(noTrail)
    ) {
      parsed.pathname = '/api/v1/connectors/notion/auth/callback';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    /* ignore and return raw trimmed value */
  }
  return trimmed.replace(/\/+$/, '');
}

/** Notion OAuth redirect — must match backend route and Notion integration settings. */
export function getNotionOAuthRedirectUri(): string {
  return buildConnectorOAuthRedirectUri('notion');
}

export function coerceSavedNotionRedirectUri(saved?: string | null): string {
  const detected = getNotionOAuthRedirectUri();
  if (!saved?.trim()) return detected;
  let uri = fixTruncatedNotionCallbackPath(saved);
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
