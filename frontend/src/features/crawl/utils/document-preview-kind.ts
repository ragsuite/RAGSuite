import type { CrawlDocument } from '@/features/crawl/types/crawl.types';

/**
 * How a document can be shown:
 * - `pdf` / `docx` / `pptx` / `text` — rendered in-app by the inspector
 * - `server` — rendered by the API preview page (`content-stream?preview=1`), e.g. XLSX
 * - `unsupported` — legacy binaries (.doc / .ppt / .xls / .rtf): download only
 */
export type DocumentPreviewKind = 'pdf' | 'docx' | 'pptx' | 'text' | 'server' | 'unsupported';

type PreviewDoc = Pick<CrawlDocument, 'mimeType' | 'name' | 'title' | 'sourceLabel'>;

const EXTENSION_KINDS: Record<string, DocumentPreviewKind> = {
  pdf: 'pdf',
  docx: 'docx',
  pptx: 'pptx',
  xlsx: 'server',
  xlsm: 'server',
  txt: 'text',
  md: 'text',
  markdown: 'text',
  csv: 'text',
  tsv: 'text',
  json: 'text',
  xml: 'text',
  html: 'text',
  htm: 'text',
  doc: 'unsupported',
  ppt: 'unsupported',
  xls: 'unsupported',
  rtf: 'unsupported',
};

function fileExtension(doc: PreviewDoc): string | null {
  for (const value of [doc.title, doc.name]) {
    const match = value?.trim().toLowerCase().match(/\.([a-z0-9]{1,8})$/);
    if (match && match[1] in EXTENSION_KINDS) return match[1];
  }
  return null;
}

function kindFromMimeType(doc: PreviewDoc, mimeType: string): DocumentPreviewKind {
  const mime = mimeType.toLowerCase().trim();
  const source = (doc.sourceLabel ?? '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('wordprocessingml') || mime === 'application/docx') return 'docx';
  if (mime.includes('presentationml') || mime === 'application/pptx') return 'pptx';
  if (mime.includes('spreadsheetml') || mime === 'application/xlsx') return 'server';
  if (
    mime.startsWith('text/') ||
    mime.includes('json') ||
    mime.includes('xml') ||
    mime.includes('html') ||
    mime.includes('markdown') ||
    ['txt', 'text', 'md', 'markdown', 'html', 'htm', 'json', 'csv'].includes(mime) ||
    source === 'gmail' ||
    (doc.title ?? doc.name).toLowerCase().startsWith('[gmail]')
  ) {
    return 'text';
  }
  return 'unsupported';
}

export function resolveDocumentPreviewKind(doc: PreviewDoc, mimeType?: string): DocumentPreviewKind {
  const extension = fileExtension(doc);
  if (extension) return EXTENSION_KINDS[extension];
  return kindFromMimeType(doc, mimeType ?? doc.mimeType);
}

/** Whether "Open in new tab" shows the content (otherwise only Download makes sense). */
export function canOpenDocumentInBrowser(kind: DocumentPreviewKind): boolean {
  return kind !== 'unsupported';
}
