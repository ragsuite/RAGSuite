import { buildConnectorOAuthRedirectUri, isLikelyBlockedOAuthRedirectHost } from '@/features/crawl/utils/connector-oauth';

function fixTruncatedGmailCallbackPath(uri: string): string {
  const trimmed = uri.trim();
  try {
    const parsed = new URL(trimmed);
    const noTrail = parsed.pathname.replace(/\/+$/, '');
    if (noTrail === '/api/v1/connectors/gmail/auth/callback') return trimmed;
    if (noTrail === '/connectors/gmail/auth/callback') {
      parsed.pathname = '/api/v1/connectors/gmail/auth/callback';
      return parsed.toString().replace(/\/+$/, '');
    }
    if (/\/api\/v1\/connectors\/gmail\/auth$/.test(noTrail) || /\/connectors\/gmail\/auth$/.test(noTrail)) {
      parsed.pathname = '/api/v1/connectors/gmail/auth/callback';
      return parsed.toString().replace(/\/+$/, '');
    }
    if (
      noTrail === '/gmail/auth/callback' ||
      /\/gmail\/auth$/.test(noTrail) ||
      noTrail === '/api/v1/gmail/auth/callback' ||
      /\/api\/v1\/gmail\/auth$/.test(noTrail)
    ) {
      parsed.pathname = '/api/v1/connectors/gmail/auth/callback';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    /* ignore and return raw trimmed value */
  }
  return trimmed.replace(/\/+$/, '');
}

/** Gmail OAuth redirect — must match backend route and Google Console "Authorized redirect URIs". */
export function getGmailOAuthRedirectUri(): string {
  return buildConnectorOAuthRedirectUri('gmail');
}

export function coerceSavedGmailRedirectUri(saved?: string | null): string {
  const detected = getGmailOAuthRedirectUri();
  if (!saved?.trim()) return detected;
  let uri = fixTruncatedGmailCallbackPath(saved);
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(uri);
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
