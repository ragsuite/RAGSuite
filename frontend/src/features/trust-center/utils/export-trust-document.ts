import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import type { TrustDocument } from '@/features/trust-center/content/types';
import {
  printTrustDocumentHtml,
  trustDocumentToDocxBuffer,
  trustDocumentToHtmlDocument,
  trustDocumentToMarkdown,
  trustDocumentToPlainText,
} from '@/features/trust-center/utils/trust-document-serializers';
import { downloadTextFile } from '@/shared/utils/download-text-file';

export type TrustExportFormat = 'markdown' | 'pdf' | 'word' | 'html' | 'plainText';

export type TrustExportResult = 'downloaded' | 'printed' | 'shared';

export function trustExportFilename(
  doc: TrustDocument,
  locale: string,
  extension: string,
): string {
  const safeTitle = doc.id.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const safeExt = extension.replace(/^\./, '');
  return `ragsuite-trust-center-${safeTitle}-${locale}.${safeExt}`;
}

function downloadBlobWeb(filename: string, blob: Blob): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Download is only available on web');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  if (typeof globalThis.btoa === 'function') {
    return globalThis.btoa(binary);
  }
  throw new Error('Base64 encoding is not available');
}

async function shareBinaryNative(filename: string, buffer: ArrayBuffer, mimeType: string): Promise<boolean> {
  const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!baseDir) return false;

  const safeName = filename.replace(/[/\\?%*:|"<>]/g, '_');
  const fileUri = `${baseDir}${safeName}`;

  try {
    const existing = await FileSystem.getInfoAsync(fileUri);
    if (existing.exists) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    }
    await FileSystem.writeAsStringAsync(fileUri, arrayBufferToBase64(buffer), {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return false;
  }

  if (!(await Sharing.isAvailableAsync())) {
    return false;
  }

  let shareUri = fileUri;
  if (Platform.OS === 'android') {
    try {
      shareUri = await FileSystem.getContentUriAsync(fileUri);
    } catch {
      return false;
    }
  }

  try {
    await Sharing.shareAsync(shareUri, {
      mimeType,
      dialogTitle: `Save ${safeName}`,
      UTI: Platform.OS === 'ios' ? 'org.openxmlformats.wordprocessingml.document' : undefined,
    });
    return true;
  } catch {
    return false;
  }
}

export async function exportTrustDocumentMarkdown(
  doc: TrustDocument,
  locale: string,
): Promise<TrustExportResult> {
  const markdown = trustDocumentToMarkdown(doc);
  const filename = trustExportFilename(doc, locale, 'md');

  if (Platform.OS === 'web') {
    const result = await downloadTextFile({
      content: markdown,
      filename,
      mimeType: 'text/markdown;charset=utf-8',
    });
    if (!result.success) throw new Error('Markdown download failed');
    return 'downloaded';
  }

  await Share.share({ title: doc.title, message: markdown });
  return 'shared';
}

export async function exportTrustDocumentHtml(
  doc: TrustDocument,
  locale: string,
): Promise<TrustExportResult> {
  const html = trustDocumentToHtmlDocument(doc);
  const filename = trustExportFilename(doc, locale, 'html');

  const result = await downloadTextFile({
    content: html,
    filename,
    mimeType: 'text/html;charset=utf-8',
  });
  if (!result.success) throw new Error('HTML export failed');
  return result.method === 'share' ? 'shared' : 'downloaded';
}

export async function exportTrustDocumentPlainText(
  doc: TrustDocument,
  locale: string,
): Promise<TrustExportResult> {
  const text = trustDocumentToPlainText(doc);
  const filename = trustExportFilename(doc, locale, 'txt');

  const result = await downloadTextFile({
    content: text,
    filename,
    mimeType: 'text/plain;charset=utf-8',
  });
  if (!result.success) throw new Error('Plain text export failed');
  return result.method === 'share' ? 'shared' : 'downloaded';
}

export async function exportTrustDocumentWord(
  doc: TrustDocument,
  locale: string,
): Promise<TrustExportResult> {
  const buffer = await trustDocumentToDocxBuffer(doc);
  const filename = trustExportFilename(doc, locale, 'docx');

  if (Platform.OS === 'web') {
    downloadBlobWeb(
      filename,
      new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    );
    return 'downloaded';
  }

  const shared = await shareBinaryNative(
    filename,
    buffer,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  if (!shared) throw new Error('Word export failed');
  return 'shared';
}

/**
 * Web: open a dedicated print window with standalone HTML (full-width A4 layout).
 * Native: fall back to Markdown share.
 */
export async function exportTrustDocumentPdf(
  doc: TrustDocument,
  locale: string,
): Promise<TrustExportResult> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const html = trustDocumentToHtmlDocument(doc);
    printTrustDocumentHtml(html, doc.title);
    return 'printed';
  }

  await exportTrustDocumentMarkdown(doc, locale);
  return 'shared';
}

export async function exportTrustDocument(
  doc: TrustDocument,
  locale: string,
  format: TrustExportFormat,
): Promise<TrustExportResult> {
  switch (format) {
    case 'markdown':
      return exportTrustDocumentMarkdown(doc, locale);
    case 'pdf':
      return exportTrustDocumentPdf(doc, locale);
    case 'word':
      return exportTrustDocumentWord(doc, locale);
    case 'html':
      return exportTrustDocumentHtml(doc, locale);
    case 'plainText':
      return exportTrustDocumentPlainText(doc, locale);
    default:
      throw new Error(`Unsupported export format: ${format satisfies never}`);
  }
}

// Backward-compatible re-exports for callers that import markdown helper directly.
export { trustDocumentToMarkdown } from '@/features/trust-center/utils/trust-document-serializers';
