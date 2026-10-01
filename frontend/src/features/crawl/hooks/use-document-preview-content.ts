import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  buildDocumentContentStreamUrl,
  fetchDocumentContentBlob,
  fetchDocumentTextContent,
} from '@/features/crawl/services/crawl.service';
import type { CrawlDocument } from '@/features/crawl/types/crawl.types';
import { convertDocxBufferToHtml, isHtmlMimeType } from '@/features/crawl/utils/document-docx-utils';
import {
  type DocumentPreviewKind,
  resolveDocumentPreviewKind,
} from '@/features/crawl/utils/document-preview-kind';

export type DocumentPreviewContent =
  | { type: 'idle' }
  | { type: 'loading' }
  /** PDF object URL or the API preview page (XLSX, failed DOCX/PPTX renders). */
  | { type: 'frame'; url: string }
  | { type: 'text'; text: string }
  | { type: 'html'; html: string }
  | { type: 'pptx'; buffer: ArrayBuffer }
  /** No inline preview: `type` = file format, `platform` = needs the web app. */
  | { type: 'download-only'; reason: 'type' | 'platform' }
  | { type: 'error' };

const isWeb = Platform.OS === 'web';

async function serverPreview(documentId: string): Promise<DocumentPreviewContent> {
  if (!isWeb) return { type: 'download-only', reason: 'platform' };
  return { type: 'frame', url: await buildDocumentContentStreamUrl(documentId, 'embed') };
}

async function loadPreviewContent(document: CrawlDocument, kind: DocumentPreviewKind): Promise<DocumentPreviewContent> {
  switch (kind) {
    case 'unsupported':
      return { type: 'download-only', reason: 'type' };
    case 'pdf': {
      if (!isWeb) return { type: 'download-only', reason: 'platform' };
      try {
        const { data, mimeType } = await fetchDocumentContentBlob(document.id);
        const blob = new Blob([data], { type: mimeType || 'application/pdf' });
        return { type: 'frame', url: URL.createObjectURL(blob) };
      } catch {
        return { type: 'frame', url: await buildDocumentContentStreamUrl(document.id) };
      }
    }
    case 'docx': {
      try {
        const { data } = await fetchDocumentContentBlob(document.id);
        return { type: 'html', html: await convertDocxBufferToHtml(data) };
      } catch {
        return serverPreview(document.id);
      }
    }
    case 'pptx': {
      if (!isWeb) return { type: 'download-only', reason: 'platform' };
      const { data } = await fetchDocumentContentBlob(document.id);
      return { type: 'pptx', buffer: data };
    }
    case 'text': {
      const text = await fetchDocumentTextContent(document.id);
      return isHtmlMimeType(document.mimeType) || isHtmlMimeType(text.slice(0, 64))
        ? { type: 'html', html: text }
        : { type: 'text', text };
    }
    case 'server':
      return serverPreview(document.id);
  }
}

function revokeIfBlob(content: DocumentPreviewContent) {
  if (content.type === 'frame' && content.url.startsWith('blob:')) URL.revokeObjectURL(content.url);
}

/** Loads what the inspector Content tab shows for a document; one request in flight at a time. */
export function useDocumentPreviewContent(document: CrawlDocument | null) {
  const [content, setContent] = useState<DocumentPreviewContent>({ type: 'idle' });
  const requestRef = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;

  const apply = useCallback((requestId: number, next: DocumentPreviewContent) => {
    if (requestRef.current !== requestId) {
      revokeIfBlob(next);
      return;
    }
    revokeIfBlob(contentRef.current);
    setContent(next);
  }, []);

  const load = useCallback(async () => {
    if (!document) return;
    const requestId = ++requestRef.current;
    apply(requestId, { type: 'loading' });
    try {
      apply(requestId, await loadPreviewContent(document, resolveDocumentPreviewKind(document)));
    } catch {
      apply(requestId, { type: 'error' });
    }
  }, [apply, document]);

  /** In-app renderer failed (e.g. unusual PPTX) — fall back to the API preview page. */
  const fallbackToServerPreview = useCallback(async () => {
    if (!document) return;
    const requestId = ++requestRef.current;
    try {
      apply(requestId, await serverPreview(document.id));
    } catch {
      apply(requestId, { type: 'error' });
    }
  }, [apply, document]);

  const reset = useCallback(() => {
    requestRef.current += 1;
    revokeIfBlob(contentRef.current);
    setContent({ type: 'idle' });
  }, []);

  useEffect(() => () => revokeIfBlob(contentRef.current), []);

  return { content, load, reset, fallbackToServerPreview };
}
