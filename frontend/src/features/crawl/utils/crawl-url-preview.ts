import { sanitizeHtml } from '@/shared/utils/sanitize-html';

export type CrawlUrlPreview = {
  url: string;
  title: string;
  textSample: string;
  htmlSample: string;
  statusCode: number;
  metadata: Record<string, unknown>;
};

export function mapCrawlUrlPreviewResponse(body: unknown, fallbackUrl: string): CrawlUrlPreview {
  if (!body || typeof body !== 'object') {
    return {
      url: fallbackUrl,
      title: 'No Title',
      textSample: '',
      htmlSample: '',
      statusCode: 200,
      metadata: {},
    };
  }

  const record = body as Record<string, unknown>;
  const meta =
    record.meta && typeof record.meta === 'object' ? (record.meta as Record<string, unknown>) : {};

  const statusFromMeta = meta.status_code;
  const statusCode =
    typeof statusFromMeta === 'number' && Number.isFinite(statusFromMeta) ? statusFromMeta : 200;

  return {
    url: typeof record.url === 'string' ? record.url : fallbackUrl,
    title: typeof meta.title === 'string' && meta.title.trim() ? meta.title : 'No Title',
    textSample: typeof record.text_sample === 'string' ? record.text_sample : '',
    htmlSample:
      typeof record.html_sample === 'string' ? sanitizeHtml(record.html_sample) : '',
    statusCode,
    metadata: meta,
  };
}
