import mammoth from 'mammoth';

import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { sanitizeHtml } from '@/shared/utils/sanitize-html';

export function isDocxDocument(document: CrawlDocument, mimeType?: string): boolean {
  const mime = (mimeType ?? document.mimeType).toLowerCase();
  const name = (document.title ?? document.name).toLowerCase();
  return (
    mime.includes('wordprocessingml') ||
    mime === 'application/docx' ||
    mime === 'application/vnd.ms-word' ||
    mime.includes('msword') ||
    name.endsWith('.docx') ||
    name.endsWith('.doc')
  );
}

export function isHtmlMimeType(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  return mime.includes('html') || mime === 'application/xhtml+xml';
}

export async function convertDocxBufferToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return sanitizeHtml(result.value);
}
