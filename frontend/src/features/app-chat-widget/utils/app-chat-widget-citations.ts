import type { AppChatCitation } from '@/features/app-chat-widget/types/app-chat-widget.types';
import { buildApiUrl, API_CONFIG } from '@/network/apiUrl';
import {
  DOCUMENT_ID_ONLY,
  extractDocumentIdFromCitationUrl,
} from '@/shared/utils/citation-url';

function normalizeCitationUrl(rawUrl: string, documentIdHint?: string): string {
  const trimmed = rawUrl.trim();
  const fromHint =
    documentIdHint && DOCUMENT_ID_ONLY.test(documentIdHint.trim())
      ? documentIdHint.trim().toLowerCase()
      : null;
  const fromUrl = extractDocumentIdFromCitationUrl(trimmed);
  const documentId = fromUrl ?? fromHint;

  if (documentId) {
    return buildApiUrl(API_CONFIG.documentContent(documentId));
  }
  if (!trimmed) return '#';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('/')) return buildApiUrl(trimmed);
  return trimmed;
}

export function normalizeChatCitation(source: unknown): AppChatCitation {
  const record = source && typeof source === 'object' ? (source as Record<string, unknown>) : {};
  const documentIdHint = String(
    record.document_id ?? record.documentId ?? record.id ?? '',
  ).trim();
  const url = normalizeCitationUrl(
    String(record.url ?? record.source_link ?? record.source_url ?? record.link ?? ''),
    documentIdHint,
  );
  return {
    title: String(record.title ?? record.name ?? 'Unknown Source'),
    url,
    snippet: record.snippet || record.text || record.content
      ? String(record.snippet ?? record.text ?? record.content)
      : undefined,
  };
}

export function hasValidCitationUrl(url?: string): boolean {
  if (!url) return false;
  const normalized = url.trim();
  return normalized !== '' && normalized !== '#';
}

const OUT_OF_CONTEXT_PATTERNS = [
  "i don't have information",
  'i do not have information',
  'not found in the provided',
  'no relevant information',
  'outside of my knowledge',
];

/** Hide citations only for short pure-refusal replies (parity with backend). */
const PURE_REFUSAL_MAX_LEN = 320;

export function shouldHideChatCitations(content: string): boolean {
  const trimmed = (content || '').trim();
  if (!trimmed) return true;
  // Substantive answers may mention hedges; keep Sources visible.
  if (trimmed.length > PURE_REFUSAL_MAX_LEN) return false;
  const lower = trimmed.toLowerCase();
  return OUT_OF_CONTEXT_PATTERNS.some((pattern) => lower.includes(pattern));
}
