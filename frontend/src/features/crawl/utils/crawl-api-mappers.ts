import type {
  AddSourcePayload,
  CrawlCadence,
  CrawlEmbeddedModel,
  CrawlEmbeddingTargetOptions,
  CrawlIngestEmbeddingTarget,
  CrawlJob,
  CrawlJobStatus,
  CrawlJobUrlEntry,
  CrawlSource,
  HeadlessMode,
  PipelineStatus,
} from '@/features/crawl/types/crawl.types';
import { mapPipelineToDisplayStatus } from '@/features/crawl/utils/crawl-pipeline-status';

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function normalizeCrawlUrl(input: string): string {
  if (!input) return '';
  const trimmed = input.toString().trim();
  const unquoted = trimmed.replace(/^([`"'])(.*)\1$/, '$2');
  return unquoted.replace(/\s+/g, ' ');
}

export function unwrapCrawlList(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { data?: unknown[] }).data)) {
    return (body as { data: unknown[] }).data;
  }
  return [];
}

function parsePipelineStatus(value: unknown): PipelineStatus {
  const raw = asString(value)?.toLowerCase();
  switch (raw) {
    case 'idle':
    case 'waiting':
    case 'queued':
    case 'crawling':
    case 'indexing':
    case 'ready':
    case 'failed':
      return raw;
    case 'running':
      return 'crawling';
    case 'pending':
      return 'queued';
    default:
      return 'idle';
  }
}

function parseLegacySourceStatus(value: unknown): CrawlSource['status'] {
  const raw = (asString(value) ?? 'IDLE').toUpperCase();
  if (raw === 'READY' || raw === 'RUNNING' || raw === 'FAILED' || raw === 'PAUSED' || raw === 'IDLE') {
    return raw;
  }
  return 'IDLE';
}

function parseHeadlessMode(value: unknown): HeadlessMode {
  const raw = (asString(value) ?? 'AUTO').toUpperCase();
  if (raw === 'ON' || raw === 'OFF' || raw === 'AUTO') return raw;
  return 'AUTO';
}

function parseCadence(value: unknown): CrawlCadence {
  const raw = (asString(value) ?? 'ONCE').toUpperCase();
  if (raw === 'DAILY' || raw === 'WEEKLY' || raw === 'ONCE') return raw;
  return 'ONCE';
}

function parseIngestEmbeddingTarget(value: unknown): CrawlIngestEmbeddingTarget | null {
  const raw = asString(value)?.toLowerCase();
  if (raw === 'search' || raw === 'chat' || raw === 'both') return raw;
  return null;
}

function parseEmbeddedModels(value: unknown): CrawlEmbeddedModel[] {
  if (!Array.isArray(value)) return [];
  const out: CrawlEmbeddedModel[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const collection = asString(record.collection);
    if (!collection) continue;
    const rawSource = record.source;
    const source: CrawlEmbeddedModel['source'] =
      rawSource === 'search' || rawSource === 'chat' ? rawSource : null;
    out.push({
      provider: asString(record.provider),
      model: asString(record.model),
      collection,
      source,
    });
  }
  return out;
}

export function mapApiEmbeddingTargetOptions(body: unknown): CrawlEmbeddingTargetOptions | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const search = record.search;
  const chat = record.chat;
  if (!search || typeof search !== 'object' || !chat || typeof chat !== 'object') return null;
  const searchRow = search as Record<string, unknown>;
  const chatRow = chat as Record<string, unknown>;
  const defaultTarget = parseIngestEmbeddingTarget(record.default_target);
  if (!defaultTarget) return null;
  const searchProvider = asString(searchRow.provider);
  const searchModel = asString(searchRow.model);
  const searchCollection = asString(searchRow.collection);
  const chatProvider = asString(chatRow.provider);
  const chatModel = asString(chatRow.model);
  const chatCollection = asString(chatRow.collection);
  if (!searchProvider || !searchModel || !searchCollection) return null;
  if (!chatProvider || !chatModel || !chatCollection) return null;
  return {
    search: {
      source: 'search',
      provider: searchProvider,
      model: searchModel,
      collection: searchCollection,
    },
    chat: {
      source: 'chat',
      provider: chatProvider,
      model: chatModel,
      collection: chatCollection,
    },
    same_collection: asBoolean(record.same_collection) ?? false,
    default_target: defaultTarget,
  };
}

export function mapApiSiteToCrawlSource(site: unknown): CrawlSource | null {
  if (!site || typeof site !== 'object') return null;
  const record = site as Record<string, unknown>;
  const id = asString(record.id);
  if (!id) return null;

  const legacyStatus = parseLegacySourceStatus(record.status);
  const pipelineStatus = parsePipelineStatus(record.pipeline_status);

  return {
    id,
    name: asString(record.name) ?? '',
    base_url: normalizeCrawlUrl(asString(record.base_url) ?? ''),
    depth: asNumber(record.depth) ?? 2,
    cadence: parseCadence(record.cadence),
    headless_mode: parseHeadlessMode(record.headless_mode),
    allowlist: asStringArray(record.allowlist),
    denylist: asStringArray(record.denylist),
    skip_header_footer: asBoolean(record.skip_header_footer) ?? true,
    description: asString(record.description) ?? '',
    status: legacyStatus,
    is_active: legacyStatus !== 'PAUSED',
    rescope_root_links: asBoolean(record.rescope_root_links) ?? false,
    created_at: asString(record.created_at) ?? new Date().toISOString(),
    updated_at: asString(record.updated_at) ?? new Date().toISOString(),
    last_crawl_at: asString(record.last_crawl_at),
    documents_count: asNumber(record.documents_count) ?? 0,
    trained_at: asString(record.trained_at),
    pipeline_status: pipelineStatus,
    is_search_ready: asBoolean(record.is_search_ready) ?? false,
    created_by: asString(record.created_by) ?? '',
    latest_job_id: asString(record.latest_job_id),
    active_job_id: asString(record.active_job_id),
    progress_percentage: asNumber(record.progress_percentage) ?? asNumber(record.progress),
    status_message: asString(record.status_message) ?? '',
    ingest_embedding_target: parseIngestEmbeddingTarget(record.ingest_embedding_target),
    indexed_embedding_models: parseEmbeddedModels(record.indexed_embedding_models),
  };
}

export function mapApiSitesList(body: unknown): CrawlSource[] {
  return unwrapCrawlList(body)
    .map(mapApiSiteToCrawlSource)
    .filter((item): item is CrawlSource => item != null);
}

export function mapAddSourcePayloadToApi(payload: AddSourcePayload): Record<string, unknown> {
  return {
    name: payload.name,
    base_url: normalizeCrawlUrl(payload.base_url),
    description: payload.description || '',
    depth: payload.depth ?? 2,
    cadence: payload.cadence || 'ONCE',
    headless_mode: payload.headless_mode || 'AUTO',
    allowlist: Array.isArray(payload.allowlist) ? payload.allowlist : [],
    denylist: Array.isArray(payload.denylist) ? payload.denylist : [],
    skip_header_footer: payload.skip_header_footer ?? true,
    rescope_root_links: payload.rescope_root_links ?? false,
    ...(payload.ingest_embedding_target
      ? { ingest_embedding_target: payload.ingest_embedding_target }
      : {}),
  };
}

export type CrawlStatusApiResponse = {
  progress: number;
  pipelineStatus?: PipelineStatus;
  isTrained?: boolean;
  trainedAt?: string | null;
  isSearchReady?: boolean;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  pagesCrawled: number;
  crawledUrlsTotal: number;
  crawledUrls: string[];
  skippedUrls: CrawlJobUrlEntry[];
  failedUrls: CrawlJobUrlEntry[];
  skippedCount: number;
  failedCount: number;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  statusMessage?: string | null;
};

function mapApiJobStatus(value: unknown): CrawlJobStatus {
  const raw = (asString(value) ?? '').toUpperCase();
  if (raw === 'PENDING' || raw === 'QUEUED') return 'RUNNING';
  if (raw === 'RUNNING') return 'RUNNING';
  if (raw === 'COMPLETED' || raw === 'FINISHED') return 'FINISHED';
  if (raw === 'FAILED') return 'FAILED';
  return 'IDLE';
}

function mapUrlEntry(row: Record<string, unknown>, includeStatusCode = false): CrawlJobUrlEntry | null {
  const url = asString(row.url);
  if (!url) return null;
  const referrers = asStringArray(row.referrers);
  const entry: CrawlJobUrlEntry = {
    url,
    reason: asString(row.reason) ?? undefined,
    referrers: referrers.length > 0 ? referrers : undefined,
    referrers_truncated: asBoolean(row.referrers_truncated) ?? undefined,
  };
  if (includeStatusCode) {
    entry.status_code = asNumber(row.status_code) ?? undefined;
  }
  return entry;
}

export function mapCrawlStatusResponse(body: unknown): CrawlStatusApiResponse | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  const apiStatus = (asString(record.status) ?? '').toUpperCase();
  const status =
    apiStatus === 'PENDING'
      ? 'pending'
      : apiStatus === 'RUNNING'
        ? 'running'
        : apiStatus === 'COMPLETED'
          ? 'completed'
          : apiStatus === 'FAILED'
            ? 'failed'
            : 'cancelled';

  const crawledUrlsRaw = Array.isArray(record.crawled_urls) ? record.crawled_urls : [];
  const crawledUrls = crawledUrlsRaw
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return asString((item as { url?: unknown }).url);
      return null;
    })
    .filter((item): item is string => Boolean(item));

  const skippedUrlsRaw = Array.isArray(record.skipped_urls) ? record.skipped_urls : [];
  const failedUrlsRaw = Array.isArray(record.failed_urls) ? record.failed_urls : [];
  const crawledUrlsTotal =
    asNumber(record.crawled_urls_total) ?? asNumber(record.pages_fetched) ?? crawledUrls.length;

  return {
    progress: asNumber(record.progress_percentage) ?? 0,
    pipelineStatus: parsePipelineStatus(record.pipeline_status),
    isTrained: asBoolean(record.is_trained) ?? false,
    trainedAt: asString(record.trained_at),
    isSearchReady: asBoolean(record.is_search_ready) ?? false,
    status,
    pagesCrawled: asNumber(record.pages_fetched) ?? crawledUrls.length,
    crawledUrlsTotal,
    crawledUrls,
    skippedUrls: skippedUrlsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return mapUrlEntry(item as Record<string, unknown>);
      })
      .filter((item): item is CrawlJobUrlEntry => item != null),
    failedUrls: failedUrlsRaw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        return mapUrlEntry(item as Record<string, unknown>, true);
      })
      .filter((item): item is CrawlJobUrlEntry => item != null),
    skippedCount: asNumber(record.skipped_count) ?? 0,
    failedCount: asNumber(record.failed_count) ?? 0,
    startedAt: asString(record.started_at) ?? asString(record.queued_at),
    completedAt: asString(record.finished_at),
    error: Array.isArray(record.errors) ? asString(record.errors[0]) : null,
    statusMessage: asString(record.status_message),
  };
}

export function mapCrawlStatusToJob(source: CrawlSource, jobId: string, status: CrawlStatusApiResponse): CrawlJob {
  const jobStatus: CrawlJobStatus =
    status.status === 'completed'
      ? 'FINISHED'
      : status.status === 'failed'
        ? 'FAILED'
        : status.status === 'running' || status.status === 'pending'
          ? 'RUNNING'
          : 'IDLE';

  return {
    id: jobId,
    source_id: source.id,
    name: source.name,
    base_url: source.base_url,
    status: jobStatus,
    documents_count: source.documents_count,
    finished_at: status.completedAt ?? null,
    is_ready: status.isSearchReady || status.status === 'completed',
    progress_percentage: status.progress,
    pipeline_status: status.pipelineStatus,
    embeddedModels: [],
    crawledCount: status.crawledUrlsTotal,
    skippedCount: status.skippedCount,
    failedCount: status.failedCount,
    crawledUrls: status.crawledUrls,
    skippedUrls: status.skippedUrls,
    failedUrls: status.failedUrls,
  };
}

export function buildJobsFromSources(sources: CrawlSource[], detailedJobs: Map<string, CrawlJob> = new Map()): CrawlJob[] {
  const jobs: CrawlJob[] = [];

  for (const source of sources) {
    const jobId = source.latest_job_id ?? source.active_job_id;
    if (!jobId) continue;

    const detailed = detailedJobs.get(jobId);
    if (detailed) {
      jobs.push({ ...detailed, documents_count: source.documents_count });
      continue;
    }

    const display = mapPipelineToDisplayStatus(source.pipeline_status, source.status);
    jobs.push({
      id: jobId,
      source_id: source.id,
      name: source.name,
      base_url: source.base_url,
      status:
        display === 'crawling' || display === 'indexing' || display === 'waiting'
          ? 'RUNNING'
          : display === 'error'
            ? 'FAILED'
            : source.trained_at
              ? 'FINISHED'
              : 'IDLE',
      documents_count: source.documents_count,
      finished_at: source.last_crawl_at,
      is_ready: source.is_search_ready,
      progress_percentage: source.progress_percentage,
      pipeline_status: source.pipeline_status,
      embeddedModels: [],
      crawledCount: source.documents_count,
      skippedCount: 0,
      failedCount: 0,
      crawledUrls: [],
      skippedUrls: [],
      failedUrls: [],
    });
  }

  return jobs.sort((a, b) => {
    const aTime = a.finished_at ? new Date(a.finished_at).getTime() : 0;
    const bTime = b.finished_at ? new Date(b.finished_at).getTime() : 0;
    return bTime - aTime;
  });
}

export function extractStartCrawlJobId(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  return asString(record.job_id) ?? asString(record.id) ?? asString(record.jobId);
}

export function extractCrawlEnqueueStatus(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  return asString(record.enqueue_status);
}
