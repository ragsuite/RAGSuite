import { buildConnectorOAuthRedirectUri, isLikelyBlockedOAuthRedirectHost } from '@/features/crawl/utils/connector-oauth';
import { coerceSavedGmailRedirectUri } from '@/features/crawl/utils/gmail-oauth';

function fixTruncatedGoogleDriveCallbackPath(uri: string): string {
  const trimmed = uri.trim();
  try {
    const parsed = new URL(trimmed);
    const noTrail = parsed.pathname.replace(/\/+$/, '');
    if (noTrail === '/api/v1/connectors/google_drive/auth/callback') return trimmed;
    if (
      noTrail === '/connectors/google_drive/auth/callback' ||
      /\/connectors\/google_drive\/auth$/.test(noTrail)
    ) {
      parsed.pathname = '/api/v1/connectors/google_drive/auth/callback';
      return parsed.toString().replace(/\/+$/, '');
    }
  } catch {
    /* ignore and return raw trimmed value */
  }
  return trimmed.replace(/\/+$/, '');
}

/** Google Drive OAuth redirect — must match backend route and Google Console. */
export function getGoogleDriveOAuthRedirectUri(): string {
  return buildConnectorOAuthRedirectUri('google_drive');
}

export function coerceSavedGoogleDriveRedirectUri(saved?: string | null): string {
  const detected = getGoogleDriveOAuthRedirectUri();
  if (!saved?.trim()) return detected;
  let uri = fixTruncatedGoogleDriveCallbackPath(saved);
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
      return coerceSavedGmailRedirectUri(saved);
    }
  }
  return uri;
}
