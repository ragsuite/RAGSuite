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

export type CitationSourceIconKind = 'pdf' | 'document' | 'globe';

const PDF_EXT = new Set(['pdf']);
const DOCUMENT_EXT = new Set(['doc', 'docx', 'txt', 'md', 'rtf']);

function extensionFromUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed, trimmed.startsWith('/') ? 'http://local.invalid' : undefined);
    const pathname = parsed.pathname || '';
    const last = pathname.split('/').pop() || '';
    const dot = last.lastIndexOf('.');
    if (dot < 0 || dot === last.length - 1) return '';
    return last.slice(dot + 1).toLowerCase();
  } catch {
    const withoutQuery = trimmed.split(/[?#]/)[0] || '';
    const last = withoutQuery.split('/').pop() || withoutQuery;
    const dot = last.lastIndexOf('.');
    if (dot < 0 || dot === last.length - 1) return '';
    return last.slice(dot + 1).toLowerCase();
  }
}

/**
 * Pick a Sources pill icon from the citation URL extension (UI only).
 * Internal document citations without a web path use the document icon.
 */
export function citationSourceIconKind(url: string | undefined): CitationSourceIconKind {
  const trimmed = (url || '').trim();
  if (!trimmed) return 'globe';

  const { domain, path } = parseCitationUrl(trimmed);
  if (domain === 'Document' && !path) return 'document';

  const ext = extensionFromUrl(trimmed);
  if (PDF_EXT.has(ext)) return 'pdf';
  if (DOCUMENT_EXT.has(ext)) return 'document';
  return 'globe';
}
