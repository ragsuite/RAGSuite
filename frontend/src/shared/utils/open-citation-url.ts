import { Linking, Platform } from 'react-native';

import { handleGetDocumentContentToken } from '@/network/actions/document.actions';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';
import {
  DOCUMENT_ID_ONLY,
  extractDocumentIdFromCitationUrl,
} from '@/shared/utils/citation-url';

function toAbsoluteApiUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed || trimmed === '#') return '';
  if (DOCUMENT_ID_ONLY.test(trimmed)) {
    return buildApiUrl(API_CONFIG.documentContent(trimmed.toLowerCase()));
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return buildApiUrl(trimmed);
  return trimmed;
}

function openInBrowser(url: string): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    }
    return;
  }
  void Linking.openURL(url);
}

/**
 * Open a chat/search citation URL.
 * Document content paths (and bare document UUIDs) open via a short-lived
 * content-stream token — plain /content requires Authorization.
 */
export async function openCitationUrl(url: string): Promise<boolean> {
  const absolute = toAbsoluteApiUrl(url);
  if (!absolute) return false;

  const documentId = extractDocumentIdFromCitationUrl(absolute) ?? extractDocumentIdFromCitationUrl(url);
  if (documentId) {
    const token = await handleGetDocumentContentToken(documentId);
    const streamUrl = `${buildApiUrl(API_CONFIG.documentContentStream(documentId))}?token=${encodeURIComponent(token)}`;
    openInBrowser(streamUrl);
    return true;
  }

  openInBrowser(absolute);
  return true;
}
