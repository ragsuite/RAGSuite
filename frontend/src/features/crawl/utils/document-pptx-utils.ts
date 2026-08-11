import { Platform } from 'react-native';

import type { CrawlDocument } from '@/features/crawl/types/crawl.types';

export function isPptxDocument(document: CrawlDocument, mimeType?: string): boolean {
  const mime = (mimeType ?? document.mimeType).toLowerCase();
  const name = (document.title ?? document.name).toLowerCase();
  return (
    mime.includes('presentationml') ||
    mime === 'application/pptx' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime.includes('ms-powerpoint') ||
    name.endsWith('.pptx') ||
    name.endsWith('.ppt')
  );
}

/**
 * Render a PPTX ArrayBuffer into a DOM host via pptx-preview (web only).
 * Returns a dispose function that clears the host.
 */
export async function renderPptxPreview(
  host: HTMLElement,
  arrayBuffer: ArrayBuffer,
): Promise<() => void> {
  if (Platform.OS !== 'web') {
    throw new Error('PPTX preview is only available on web');
  }
  const width = Math.max(320, Math.floor(host.clientWidth || host.parentElement?.clientWidth || 720));
  const height = Math.max(240, Math.round((width * 9) / 16));
  host.innerHTML = '';
  const { init } = await import('pptx-preview');
  const viewer = init(host, { width, height });
  await viewer.preview(arrayBuffer);
  return () => {
    try {
      host.innerHTML = '';
    } catch {
      // ignore
    }
  };
}
