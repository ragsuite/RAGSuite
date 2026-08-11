import type {
  CrawlJob,
  CrawlJobFilterStatus,
  CrawlJobStatus,
  CrawlSource,
  CrawlSourceDisplayStatus,
  PipelineStatus,
} from '@/features/crawl/types/crawl.types';
import { mapPipelineToDisplayStatus } from '@/features/crawl/utils/crawl-pipeline-status';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function formatCrawlDepthLabel(depth: number): string {
  if (depth === 0) return 'This page only';
  if (depth === 1) return '1 level (start URL + linked pages)';
  if (depth === 5) return '5 levels (deep crawl)';
  return `${depth} level${depth === 1 ? '' : 's'}`;
}

export function formatRelativeTime(iso: string | null, t?: TranslateFn): string {
  if (!iso) return t?.('crawl.table.never') ?? t?.('overview.sources.neverCrawled') ?? 'Never';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t?.('overview.time.justNow') ?? 'Just now';
  if (minutes < 60) {
    return minutes === 1
      ? (t?.('overview.time.minuteAgo') ?? '1 min ago')
      : (t?.('overview.time.minutesAgo', { count: minutes }) ?? `${minutes} min ago`);
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return hours === 1
      ? (t?.('overview.time.hourAgo') ?? '1 hour ago')
      : (t?.('overview.time.hoursAgo', { count: hours }) ?? `${hours} hours ago`);
  }
  const days = Math.floor(hours / 24);
  return days === 1
    ? (t?.('overview.time.dayAgo') ?? '1 day ago')
    : (t?.('overview.time.daysAgo', { count: days }) ?? `${days} days ago`);
}

export function formatShortDate(iso: string | null, locale?: string): string {
  if (!iso) return '—';
  try {
    const resolvedLocale = locale === 'en-gb' ? 'en-GB' : locale;
    return new Date(iso).toLocaleDateString(resolvedLocale ?? 'en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

export function formatTime(iso: string | null, locale?: string): string {
  if (!iso) return '—';
  try {
    const resolvedLocale = locale === 'en-gb' ? 'en-GB' : locale;
    return new Date(iso).toLocaleTimeString(resolvedLocale ?? 'en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function getSourceStatusTone(
  source: Pick<CrawlSource, 'pipeline_status' | 'status'>,
): 'default' | 'primary' | 'success' | 'muted' | 'danger' {
  const pipeline = source.pipeline_status;
  let status: string;
  if (pipeline) {
    status = pipeline === 'ready' ? 'active' : pipeline === 'failed' ? 'error' : pipeline;
  } else {
    status = (source.status || 'unknown').toLowerCase();
  }
  if (status === 'active') return 'primary';
  if (status === 'error' || status === 'failed') return 'danger';
  if (status === 'crawling' || status === 'running' || status === 'queued') return 'default';
  if (status === 'indexing' || status === 'waiting') return 'default';
  if (status === 'pending') return 'muted';
  return 'muted';
}

export function getDisplayStatusTone(
  status: CrawlSourceDisplayStatus,
): 'default' | 'primary' | 'success' | 'muted' | 'danger' {
  if (status === 'active') return 'primary';
  if (status === 'error') return 'danger';
  if (status === 'crawling' || status === 'indexing' || status === 'waiting' || status === 'queued') return 'default';
  if (status === 'pending') return 'muted';
  return 'muted';
}

export function getJobStatusTone(status: CrawlJobStatus): 'default' | 'success' | 'muted' | 'danger' {
  if (status === 'FINISHED') return 'success';
  if (status === 'FAILED') return 'danger';
  if (status === 'RUNNING') return 'default';
  return 'muted';
}

export function getPipelineTone(status: PipelineStatus): 'default' | 'success' | 'muted' | 'danger' {
  if (status === 'ready') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'crawling' || status === 'indexing' || status === 'waiting' || status === 'queued') return 'default';
  return 'muted';
}

export function translateJobStatus(status: CrawlJobStatus, t: TranslateFn): string {
  switch (status) {
    case 'RUNNING':
      return t('crawl.jobs.status.running');
    case 'FINISHED':
      return t('crawl.jobs.status.completed');
    case 'FAILED':
      return t('crawl.jobs.status.failed');
    case 'IDLE':
      return t('crawl.jobs.status.pending');
  }
}

export function translatePipelineStatus(status: PipelineStatus, t: TranslateFn): string {
  switch (status) {
    case 'ready':
      return t('crawl.filters.statusActive');
    case 'failed':
      return t('crawl.filters.statusError');
    case 'waiting':
    case 'queued':
      return t('crawl.jobs.status.waiting');
    case 'crawling':
    case 'indexing':
      return t('crawl.jobs.status.running');
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

/** Site status string used for filters and badges (reference `mapPipelineToSiteStatus`). */
export function resolveSiteStatus(
  source: Pick<CrawlSource, 'pipeline_status' | 'status'>,
): string {
  return mapPipelineToDisplayStatus(source.pipeline_status, source.status);
}

export function displaySourceStatus(
  source: Pick<CrawlSource, 'pipeline_status' | 'status'>,
  t?: TranslateFn,
): string {
  const pipeline = source.pipeline_status;
  let status: string;
  if (pipeline) {
    status = pipeline === 'ready' ? 'active' : pipeline === 'failed' ? 'error' : pipeline;
  } else {
    status = (source.status || 'unknown').toLowerCase();
  }

  const key = `crawl.table.status.${status}`;
  const translated = t?.(key);
  if (translated && translated !== key) return translated;
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function matchesSourceStatusFilter(
  source: Pick<CrawlSource, 'pipeline_status' | 'status'>,
  filter: CrawlSourceDisplayStatus | 'all',
): boolean {
  if (filter === 'all') return true;
  return resolveSiteStatus(source) === filter;
}

/** Jobs sub-tab filters sources (reference `CrawlJobs.tsx`). */
export function matchesJobSourceFilter(
  source: Pick<
    CrawlSource,
    'pipeline_status' | 'status' | 'progress_percentage' | 'last_crawl_at'
  >,
  filter: CrawlJobFilterStatus,
): boolean {
  if (filter === 'all') return true;
  const siteStatus = resolveSiteStatus(source);
  const progress = source.progress_percentage;

  switch (filter) {
    case 'running':
      return siteStatus === 'crawling' || siteStatus === 'running' || siteStatus === 'indexing';
    case 'completed':
      return siteStatus === 'active' && (progress === 100 || progress == null);
    case 'failed':
      return siteStatus === 'error' || siteStatus === 'failed';
    case 'pending':
      return siteStatus === 'pending' || (siteStatus === 'active' && !source.last_crawl_at);
    default:
      return true;
  }
}

export function matchesJobStatusFilter(
  job: Pick<CrawlJob, 'status' | 'pipeline_status' | 'finished_at' | 'is_ready' | 'documents_count'>,
  filter: CrawlJobFilterStatus,
): boolean {
  if (filter === 'all') return true;
  const pipeline = job.pipeline_status;
  switch (filter) {
    case 'running':
      return (
        job.status === 'RUNNING' ||
        pipeline === 'crawling' ||
        pipeline === 'indexing' ||
        pipeline === 'waiting' ||
        pipeline === 'queued'
      );
    case 'completed':
      return job.status === 'FINISHED' || pipeline === 'ready' || job.is_ready;
    case 'failed':
      return job.status === 'FAILED' || pipeline === 'failed';
    case 'pending':
      return job.status === 'IDLE' && !job.finished_at;
    default:
      return true;
  }
}

export function getJobRowStatus(source: Pick<CrawlSource, 'pipeline_status' | 'status'>): {
  isRunning: boolean;
  isIndexing: boolean;
  label: string;
} {
  const siteStatus = resolveSiteStatus(source);
  const isIndexing = siteStatus === 'indexing';
  const isRunning = siteStatus === 'crawling' || siteStatus === 'indexing' || siteStatus === 'waiting' || siteStatus === 'queued';
  return {
    isIndexing,
    isRunning,
    label: isIndexing ? 'Indexing' : isRunning ? 'Running' : 'Idle',
  };
}

export function sourceIsTrained(source: Pick<CrawlSource, 'trained_at' | 'is_search_ready'>): boolean {
  return Boolean(source.trained_at && source.is_search_ready);
}

/** Last-crawl column: never say "Finished" while crawl/index is still in flight. */
export function getJobLastCrawlLabel(
  source: Pick<CrawlSource, 'pipeline_status' | 'status' | 'last_crawl_at' | 'trained_at'>,
  locale?: string,
): string {
  const siteStatus = resolveSiteStatus(source);
  if (siteStatus === 'waiting' || siteStatus === 'queued') return 'Queued…';
  if (siteStatus === 'crawling' || siteStatus === 'running') return 'Crawling…';
  if (siteStatus === 'indexing') return 'Indexing…';
  if (siteStatus === 'error' || siteStatus === 'failed') {
    return source.last_crawl_at ? `Failed ${formatTime(source.last_crawl_at, locale)}` : 'Failed';
  }
  // Prefer trained_at when ready — last_crawl_at is set when fetch ends, before indexing.
  const doneAt = source.trained_at || source.last_crawl_at;
  if (doneAt) return `Finished ${formatTime(doneAt, locale)}`;
  return 'Not started';
}

export type JobReadinessKind = 'ready' | 'indexing' | 'crawling' | 'pending' | 'error' | 'none';

/** Sub-label under last-crawl: only show Indexing when pipeline is actually indexing. */
export function getJobReadinessKind(
  source: Pick<CrawlSource, 'pipeline_status' | 'status' | 'trained_at' | 'is_search_ready'>,
): JobReadinessKind {
  const siteStatus = resolveSiteStatus(source);
  if (siteStatus === 'error' || siteStatus === 'failed') return 'error';
  if (sourceIsTrained(source)) return 'ready';
  if (siteStatus === 'indexing') return 'indexing';
  if (siteStatus === 'crawling' || siteStatus === 'running' || siteStatus === 'waiting' || siteStatus === 'queued') {
    return 'crawling';
  }
  if (!source.trained_at) return 'pending';
  return 'none';
}

export function shouldShowCrawlProgress(source: Pick<CrawlSource, 'pipeline_status' | 'progress_percentage'>): boolean {
  if (source.progress_percentage == null) return false;
  const pipeline = source.pipeline_status;
  return pipeline === 'waiting' || pipeline === 'queued' || pipeline === 'crawling' || pipeline === 'indexing';
}
