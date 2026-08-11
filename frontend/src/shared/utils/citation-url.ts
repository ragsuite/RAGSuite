const DOCUMENT_UUID =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export const DOCUMENT_ID_ONLY = new RegExp(`^${DOCUMENT_UUID}$`, 'i');

const DOCUMENT_CONTENT_PATH = new RegExp(
  `\\/api\\/v1\\/documents\\/(${DOCUMENT_UUID})\\/content(?:-stream)?\\/?(?:\\?.*)?$`,
  'i',
);

/** Resolve an uploaded-document id from a citation URL or bare UUID. */
export function extractDocumentIdFromCitationUrl(url: string): string | null {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  if (DOCUMENT_ID_ONLY.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  const pathMatch = trimmed.match(DOCUMENT_CONTENT_PATH);
  if (pathMatch?.[1]) {
    return pathMatch[1].toLowerCase();
  }
  try {
    const parsed = new URL(trimmed, trimmed.startsWith('/') ? 'http://local.invalid' : undefined);
    const match = (parsed.pathname + parsed.search).match(DOCUMENT_CONTENT_PATH);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Display helpers for citation source lines.
 * Internal document API URLs / bare document UUIDs show as "Document".
 */
export function parseCitationUrl(url: string): { domain: string; path: string } {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed === '#') {
    return { domain: '', path: '' };
  }

  if (extractDocumentIdFromCitationUrl(trimmed)) {
    return { domain: 'Document', path: '' };
  }

  try {
    const parsed = new URL(trimmed, trimmed.startsWith('/') ? 'http://local.invalid' : undefined);
    // Relative paths parsed with a dummy base — do not show the dummy host.
    if (trimmed.startsWith('/')) {
      return { domain: trimmed, path: '' };
    }
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return {
      domain: parsed.hostname.replace(/^www\./, ''),
      path: path === '/' ? '' : path,
    };
  } catch {
    return { domain: trimmed, path: '' };
  }
}
