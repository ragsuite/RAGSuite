import mammoth from 'mammoth';

import { sanitizeHtml } from '@/shared/utils/sanitize-html';

export function isHtmlMimeType(mimeType: string): boolean {
  const mime = mimeType.toLowerCase();
  return mime.includes('html') || mime === 'application/xhtml+xml';
}

export async function convertDocxBufferToHtml(arrayBuffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return sanitizeHtml(result.value);
}
