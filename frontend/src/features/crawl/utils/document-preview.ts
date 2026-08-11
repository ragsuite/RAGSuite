import { Platform } from 'react-native';

import { fetchDocumentContentBlob, openDocumentWithToken } from '@/features/crawl/services/crawl.service';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import {
  convertDocxBufferToHtml,
  isDocxDocument,
} from '@/features/crawl/utils/document-docx-utils';
import { translations } from '@/i18n/constants';
import { openCitationUrl } from '@/shared/utils/open-citation-url';

function translateEn(key: string, params?: Record<string, string | number>) {
  let text = translations.en[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([param, value]) => {
      text = text.replace(new RegExp(`{{${param}}}`, 'g'), String(value));
    });
  }
  return text;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Browsers cannot render DOCX like PDF. Open a sanitized HTML preview tab
 * (same mammoth path as the inspector Content tab) instead of forcing a download.
 */
async function openDocxPreviewInBrowser(document: CrawlDocument): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;

  const { data, mimeType } = await fetchDocumentContentBlob(document.id);
  if (!isDocxDocument(document, mimeType)) return false;

  const bodyHtml = await convertDocxBufferToHtml(data);
  const title = escapeHtmlText(document.title || document.name || 'Document');
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0 auto;
      max-width: 52rem;
      padding: 2rem 1.25rem 3rem;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 1.05rem;
      line-height: 1.55;
      color: #1a1a1a;
      background: #fafafa;
    }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #ddd; padding: 0.4rem 0.6rem; }
    h1, h2, h3, h4 { line-height: 1.25; }
  </style>
</head>
<body>${bodyHtml}</body>
</html>`;

  const objectUrl = URL.createObjectURL(new Blob([fullHtml], { type: 'text/html;charset=utf-8' }));
  const win = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  // Keep blob alive long enough for the new tab to load; revoke afterward.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  if (win) return true;

  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  window.document.body.appendChild(anchor);
  anchor.click();
  window.document.body.removeChild(anchor);
  return true;
}

export async function openDocumentPreview(
  document: CrawlDocument,
  t: (key: string, params?: Record<string, string | number>) => string = translateEn,
): Promise<boolean> {
  // DOCX: open HTML preview tab (PDF-like viewing). Raw content-stream uses
  // Content-Disposition: attachment and downloads in every browser.
  if (isDocxDocument(document)) {
    try {
      const openedDocx = await openDocxPreviewInBrowser(document);
      if (openedDocx) return true;
    } catch {
      // Fall through to token stream / alert.
    }
  }

  // Never open bare `/content` via Linking — browsers omit Authorization and hit 401.
  // Prefer tokenized content-stream (via fileUrl or document id).
  if (document.fileUrl) {
    try {
      await openCitationUrl(document.fileUrl);
      return true;
    } catch {
      // Fall through to id-based tokenized stream.
    }
  }

  const opened = await openDocumentWithToken(document.id, document.mimeType);
  if (opened) return true;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(t('documents.previewAlert', { title: document.title ?? document.name }));
    return true;
  }

  return false;
}
