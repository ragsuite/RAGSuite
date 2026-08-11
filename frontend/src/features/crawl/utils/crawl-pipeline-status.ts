import type { CrawlJob, CrawlSource, PipelineStatus } from '@/features/crawl/types/crawl.types';

/** Matches backend default `max_concurrent_crawls_per_user`. */
export const DEFAULT_MAX_CONCURRENT_CRAWLS = 2;

export const IN_FLIGHT_PIPELINE_STATUSES = new Set<PipelineStatus>([
  'waiting',
  'queued',
  'crawling',
  'indexing',
]);

export const TERMINAL_PIPELINE_STATUSES = new Set<PipelineStatus>(['ready', 'failed']);

export type CrawlSourceDisplayStatus =
  | 'active'
  | 'inactive'
  | 'pending'
  | 'error'
  | 'waiting'
  | 'queued'
  | 'crawling'
  | 'indexing'
  | 'unknown';

export function mapPipelineToDisplayStatus(
  pipelineStatus?: PipelineStatus | string | null,
  legacyStatus?: string | null,
): CrawlSourceDisplayStatus {
  switch (pipelineStatus) {
    case 'idle':
      return 'inactive';
    case 'waiting':
      return 'waiting';
    case 'queued':
      return 'crawling';
    case 'crawling':
      return 'crawling';
    case 'indexing':
      return 'indexing';
    case 'failed':
      return 'error';
    case 'ready':
      return 'active';
    default:
      break;
  }

  const legacy = (legacyStatus || '').toUpperCase();
  if (legacy === 'READY' || legacy === 'PENDING') return 'active';
  if (legacy === 'DISABLED' || legacy === 'PAUSED' || legacy === 'IDLE') return 'inactive';
  if (legacy === 'CRAWLING' || legacy === 'RUNNING') return 'crawling';
  if (legacy === 'FAILED') return 'error';
  return 'unknown';
}

export function isPipelineInFlight(pipelineStatus?: PipelineStatus | string | null): boolean {
  return !!pipelineStatus && IN_FLIGHT_PIPELINE_STATUSES.has(pipelineStatus as PipelineStatus);
}

export function sourceHasActiveCrawlJob(source: Pick<CrawlSource, 'active_job_id' | 'latest_job_id' | 'pipeline_status' | 'status'>): boolean {
  if (!source.active_job_id && !source.latest_job_id) {
    return false;
  }
  if (source.pipeline_status && IN_FLIGHT_PIPELINE_STATUSES.has(source.pipeline_status)) {
    return true;
  }
  const display = mapPipelineToDisplayStatus(source.pipeline_status, source.status);
  return display === 'crawling' || display === 'indexing' || display === 'waiting';
}

export function countActiveCrawlJobs(sources: CrawlSource[]): number {
  if (!Array.isArray(sources)) return 0;
  return sources.filter(sourceHasActiveCrawlJob).length;
}

export function isAtConcurrentCrawlLimit(
  sources: CrawlSource[],
  limit: number = DEFAULT_MAX_CONCURRENT_CRAWLS,
): boolean {
  if (limit <= 0) return false;
  return countActiveCrawlJobs(sources) >= limit;
}

export function canStartCrawlForSite(
  source: Pick<CrawlSource, 'active_job_id' | 'latest_job_id' | 'pipeline_status' | 'status'>,
): boolean {
  return !sourceHasActiveCrawlJob(source);
}

export function isCrawlJobTerminal(job: Pick<CrawlJob, 'status' | 'progress_percentage' | 'pipeline_status'>): boolean {
  if (job.pipeline_status && TERMINAL_PIPELINE_STATUSES.has(job.pipeline_status)) {
    return true;
  }
  return job.status === 'FINISHED' || job.status === 'FAILED' || (job.progress_percentage ?? 0) >= 100;
}

export function applyCrawlStatusToSource(
  source: CrawlSource,
  status: {
    progress?: number | null;
    pipelineStatus?: PipelineStatus | null;
    isTrained?: boolean;
    trainedAt?: string | null;
    isSearchReady?: boolean;
    status?: string;
  },
): CrawlSource {
  const pipelineStatus = (status.pipelineStatus ?? source.pipeline_status) as PipelineStatus;
  const terminal =
    (status.pipelineStatus && TERMINAL_PIPELINE_STATUSES.has(status.pipelineStatus)) ||
    status.status === 'completed' ||
    status.status === 'failed' ||
    (status.progress ?? 0) >= 100;

  return {
    ...source,
    progress_percentage: status.progress ?? source.progress_percentage,
    pipeline_status: pipelineStatus,
    trained_at: status.trainedAt ?? source.trained_at,
    is_search_ready: status.isSearchReady ?? source.is_search_ready,
    status: source.status,
    active_job_id: terminal ? null : source.active_job_id ?? source.latest_job_id,
  };
}

export function isCrawlStatusTerminal(status: {
  pipelineStatus?: PipelineStatus | string | null;
  status?: string;
  progress?: number | null;
}): boolean {
  if (status.pipelineStatus && TERMINAL_PIPELINE_STATUSES.has(status.pipelineStatus as PipelineStatus)) {
    return true;
  }
  return (
    status.status === 'completed' ||
    status.status === 'failed' ||
    (status.progress ?? 0) >= 100
  );
}

export function displayStatusForSource(
  source: Pick<CrawlSource, 'pipeline_status' | 'status' | 'trained_at'>,
): CrawlSourceDisplayStatus {
  if (source.pipeline_status) {
    const mapped = mapPipelineToDisplayStatus(source.pipeline_status, source.status);
    if (mapped === 'active' && !source.trained_at) {
      return 'pending';
    }
    return mapped;
  }
  return mapPipelineToDisplayStatus(undefined, source.status);
}

export function jobIdForPolling(source: Pick<CrawlSource, 'pipeline_status' | 'active_job_id' | 'latest_job_id'>): string | null {
  if (!isPipelineInFlight(source.pipeline_status)) {
    return null;
  }
  return source.active_job_id ?? source.latest_job_id;
}
