import type { CrawlDocument, DocumentStatus } from '@/features/crawl/types/crawl.types';
import type { ItemEmbeddingCoverageEntry } from '@/features/search-config/types/embedding.types';

type ApiDocument = {
  id?: string;
  title?: string;
  description?: string;
  type?: string;
  source?: string;
  language?: string;
  status?: string;
  chunks?: number;
  lastIndexed?: string;
  url?: string;
  checksum?: string;
  size?: string;
};

function parseSizeKb(size: string | undefined): number {
  if (!size?.trim()) return 0;
  const trimmed = size.trim();
  const match = trimmed.match(/^([\d.]+)\s*(kb|mb|gb|b)?$/i);
  if (!match) {
    const numeric = Number.parseFloat(trimmed);
    return Number.isFinite(numeric) ? Math.round(numeric) : 0;
  }
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return 0;
  const unit = (match[2] ?? 'b').toLowerCase();
  if (unit === 'gb') return Math.round(value * 1024 * 1024);
  if (unit === 'mb') return Math.round(value * 1024);
  if (unit === 'kb') return Math.round(value);
  return Math.round(value / 1024);
}

function normalizeDocumentStatus(status: string | undefined): DocumentStatus {
  const s = (status ?? '').trim().toLowerCase();
  if (s === 'indexed') return 'indexed';
  if (s.includes('fail') || s.includes('error')) return 'failed';
  if (s === 'extracting') return 'extracting';
  if (s === 'indexing' || s.includes('processing')) return 'indexing';
  return 'queued';
}

function formatEmbeddedModels(entry: ItemEmbeddingCoverageEntry | undefined): string[] {
  if (!entry?.embedded_models?.length) return [];
  return entry.embedded_models.map((model) => {
    const provider = model.provider ?? 'unknown';
    const name = model.model ?? 'unknown';
    const suffix = model.is_active ? ' (active)' : '';
    return `${provider} / ${name}${suffix}`;
  });
}

export function mapApiDocument(
  raw: ApiDocument,
  coverage?: ItemEmbeddingCoverageEntry,
): CrawlDocument | null {
  if (!raw.id) return null;
  const title = raw.title?.trim() || 'Untitled';
  return {
    id: raw.id,
    name: title,
    title,
    description: raw.description?.trim() || null,
    mimeType: raw.type?.trim() || 'application/octet-stream',
    sizeKb: parseSizeKb(raw.size),
    sourceLabel: raw.source?.trim() || title,
    language: raw.language?.trim() || 'en',
    indexedAt: raw.lastIndexed?.trim() || null,
    status: normalizeDocumentStatus(raw.status),
    checksum: raw.checksum?.trim() || '—',
    chunksCount: typeof raw.chunks === 'number' ? raw.chunks : 0,
    embeddedModels: formatEmbeddedModels(coverage),
    fileUrl: raw.url?.trim() || null,
  };
}

export function mapApiDocumentsList(
  body: unknown,
  coverageById?: Map<string, ItemEmbeddingCoverageEntry>,
): CrawlDocument[] {
  const list = Array.isArray(body) ? body : [];
  return list
    .map((item) => mapApiDocument(item as ApiDocument, coverageById?.get((item as ApiDocument).id ?? '')))
    .filter((doc): doc is CrawlDocument => doc != null);
}

export function parseEmbeddingItemCoverage(body: unknown): import('@/features/search-config/types/embedding.types').EmbeddingItemCoverage | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  return {
    project_id: String(raw.project_id ?? ''),
    source: (raw.source === 'search' ? 'search' : 'chat') as 'search' | 'chat',
    active_provider: String(raw.active_provider ?? ''),
    active_model: String(raw.active_model ?? ''),
    active_collection: String(raw.active_collection ?? ''),
    documents: Array.isArray(raw.documents) ? (raw.documents as ItemEmbeddingCoverageEntry[]) : [],
    crawl_sources: Array.isArray(raw.crawl_sources) ? (raw.crawl_sources as ItemEmbeddingCoverageEntry[]) : [],
  };
}

export function buildCoverageByDocumentId(
  coverage: import('@/features/search-config/types/embedding.types').EmbeddingItemCoverage | null,
): Map<string, ItemEmbeddingCoverageEntry> {
  const map = new Map<string, ItemEmbeddingCoverageEntry>();
  for (const entry of coverage?.documents ?? []) {
    map.set(entry.id, entry);
    map.set(entry.id.toLowerCase(), entry);
  }
  return map;
}

export function buildCoverageByCrawlSourceId(
  coverage: import('@/features/search-config/types/embedding.types').EmbeddingItemCoverage | null,
): Map<string, ItemEmbeddingCoverageEntry> {
  const map = new Map<string, ItemEmbeddingCoverageEntry>();
  for (const entry of coverage?.crawl_sources ?? []) {
    map.set(entry.id, entry);
    map.set(entry.id.toLowerCase(), entry);
  }
  return map;
}
