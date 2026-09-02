import { Linking, Platform } from 'react-native';

import type {
  AddSourcePayload,
  CrawlBundle,
  CrawlEmbeddingTargetOptions,
  CrawlGmailState,
  CrawlJob,
  CrawlSource,
  DocumentFormPayload,
  GmailCredentials,
  GmailInboxIndexResult,
  GmailInboxPage,
  GmailSyncJob,
} from '@/features/crawl/types/crawl.types';
import {
  applyCrawlStatusToSource,
  isCrawlStatusTerminal,
  isPipelineInFlight,
  jobIdForPolling,
} from '@/features/crawl/utils/crawl-pipeline-status';
import {
  buildJobsFromSources,
  extractStartCrawlJobId,
  extractCrawlEnqueueStatus,
  mapApiSitesList,
  mapApiEmbeddingTargetOptions,
  mapCrawlStatusResponse,
  mapCrawlStatusToJob,
  normalizeCrawlUrl,
} from '@/features/crawl/utils/crawl-api-mappers';
import {
  buildCoverageByDocumentId,
  mapApiDocumentsList,
  parseEmbeddingItemCoverage,
} from '@/features/crawl/utils/document-api-mappers';
import { inferMimeType } from '@/features/crawl/utils/document-form';
import { mapCrawlUrlPreviewResponse, type CrawlUrlPreview } from '@/features/crawl/utils/crawl-url-preview';
import {
  handleAddCrawlSite,
  handleDeleteCrawlSite,
  handleGetCrawlSites,
  handleGetCrawlEmbeddingTargetOptions,
  handleGetCrawlStatus,
  handlePreviewCrawlUrl,
  handleStartCrawl,
  handleUpdateCrawlSite,
} from '@/network/actions/crawl.actions';
import {
  handleDeleteDocument,
  handleGetDocumentChunks,
  handleGetDocumentContent,
  handleGetDocumentContentToken,
  handleGetDocuments,
  handleUpdateDocument,
  handleUploadDocument,
} from '@/network/actions/document.actions';
import {
  handleDisconnectGmail,
  handleDismissGmailInbox,
  handleGetGmailAuthUrl,
  handleGetGmailCredentialStatus,
  handleGetGmailJobs,
  handleGetGmailStatus,
  handleIndexGmailInbox,
  handleListGmailInbox,
  handlePauseGmail,
  handleResumeGmail,
  handleTriggerGmailSync,
  handleUpsertGmailCredentials,
} from '@/network/actions/gmail.actions';
import {
  handleGetProjectEmbeddingItemCoverage,
  handleGetProjectEmbeddingStatus,
  handleGetProjectReindexProgress,
  handlePostProjectReindex,
} from '@/network/actions/embedding.actions';
import { API_CONFIG, buildApiUrl } from '@/network/apiUrl';
import { fetchWithAuth } from '@/network/request';
import type { EmbeddingSource, ReindexProgress } from '@/features/search-config/types/embedding.types';
import { parseReindexProgress } from '@/features/search-config/utils/search-api-mappers';

const jobDetailsCache = new Map<string, CrawlJob>();

export function pruneJobDetailsCacheForSource(sourceId: string, keepJobId: string | null = null) {
  for (const [jobId, job] of jobDetailsCache.entries()) {
    if (job.source_id === sourceId && jobId !== keepJobId) {
      jobDetailsCache.delete(jobId);
    }
  }
}

let activeProjectId: string | null = null;

export function configureCrawlProject(projectId: string | null) {
  activeProjectId = projectId;
}

export function getActiveCrawlProjectId(): string | null {
  return activeProjectId;
}

function requireProjectId(): string {
  if (!activeProjectId) throw new Error('errors.project.selectFirst');
  return activeProjectId;
}

async function tryRead<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

function cloneJob(job: CrawlJob): CrawlJob {
  return {
    ...job,
    embeddedModels: [...job.embeddedModels],
    crawledUrls: [...job.crawledUrls],
    skippedUrls: job.skippedUrls.map((item) => ({ ...item })),
    failedUrls: job.failedUrls.map((item) => ({ ...item })),
  };
}

async function fetchSourcesFromApi(): Promise<CrawlSource[]> {
  const body = await handleGetCrawlSites();
  return mapApiSitesList(body);
}

export async function fetchCrawlEmbeddingTargetOptions(): Promise<CrawlEmbeddingTargetOptions | null> {
  const body = await handleGetCrawlEmbeddingTargetOptions();
  return mapApiEmbeddingTargetOptions(body);
}

async function fetchDocumentsFromApi(
  coverageBody?: unknown | null,
): Promise<CrawlBundle['documents']> {
  const projectId = activeProjectId;
  let resolvedCoverage = coverageBody;
  let docsBody: unknown;

  if (coverageBody !== undefined) {
    docsBody = await handleGetDocuments();
  } else {
    const [docs, coverage] = await Promise.all([
      handleGetDocuments(),
      projectId
        ? tryRead(() => handleGetProjectEmbeddingItemCoverage(projectId, 'chat'))
        : Promise.resolve(null),
    ]);
    docsBody = docs;
    resolvedCoverage = coverage;
  }

  const coverage = resolvedCoverage ? parseEmbeddingItemCoverage(resolvedCoverage) : null;
  const coverageById = buildCoverageByDocumentId(coverage);
  return mapApiDocumentsList(docsBody, coverageById);
}

async function enrichInFlightSources(sources: CrawlSource[]): Promise<CrawlSource[]> {
  const targets = sources.filter((source) => jobIdForPolling(source));
  if (targets.length === 0) return sources;

  const updates = await Promise.all(
    targets.map(async (source) => {
      const jobId = jobIdForPolling(source);
      if (!jobId) return source;
      try {
        const body = await handleGetCrawlStatus(jobId);
        const status = mapCrawlStatusResponse(body);
        if (!status) return source;
        jobDetailsCache.set(jobId, mapCrawlStatusToJob(source, jobId, status));
        return applyCrawlStatusToSource(source, {
          progress: status.progress,
          pipelineStatus: status.pipelineStatus,
          isTrained: status.isTrained,
          trainedAt: status.trainedAt,
          isSearchReady: status.isSearchReady,
          status: status.status,
          statusMessage: status.statusMessage,
        });
      } catch {
        return source;
      }
    }),
  );

  const byId = new Map(updates.map((source) => [source.id, source]));
  return sources.map((source) => byId.get(source.id) ?? source);
}

async function buildBundle(sources: CrawlSource[], documents: CrawlBundle['documents']): Promise<CrawlBundle> {
  const enriched = await enrichInFlightSources(sources);
  return mergeSourcesAndDocuments(enriched, documents);
}

function mergeSourcesAndDocuments(sources: CrawlSource[], documents: CrawlBundle['documents']): CrawlBundle {
  const jobs = buildJobsFromSources(sources, jobDetailsCache);
  return {
    sources: sources.map((item) => ({ ...item, allowlist: [...item.allowlist], denylist: [...item.denylist] })),
    jobs: jobs.map(cloneJob),
    documents: documents.map((item) => ({ ...item, embeddedModels: [...item.embeddedModels] })),
  };
}

/** List poll only — mirrors web `crawlAPI.getSites()` without documents/embedding. */
export async function refreshCrawlSourcesOnly(currentBundle: CrawlBundle): Promise<CrawlBundle> {
  const sources = await fetchSourcesFromApi();
  return mergeSourcesAndDocuments(sources, currentBundle.documents);
}

/** Job detail sheet — single `getCrawlStatus` call (reference `CrawlJobs.tsx`). */
export async function fetchCrawlJobDetail(jobId: string, source: CrawlSource): Promise<CrawlJob> {
  const body = await handleGetCrawlStatus(jobId);
  const status = mapCrawlStatusResponse(body);
  if (!status) throw new Error('errors.crawl.jobStatusFailed');
  const job = mapCrawlStatusToJob(source, jobId, status);
  jobDetailsCache.set(jobId, job);
  return cloneJob(job);
}

export type CrawlSourcePollResult = {
  bundle: CrawlBundle;
  terminal: boolean;
};

/** Per-job status poll — patches sources in bundle; full refresh when terminal. */
export async function pollCrawlSourceStatus(
  currentBundle: CrawlBundle,
  sourceId: string,
  jobId: string,
): Promise<CrawlSourcePollResult> {
  const source = currentBundle.sources.find((item) => item.id === sourceId);
  if (!source) {
    return { bundle: currentBundle, terminal: false };
  }

  try {
    const body = await handleGetCrawlStatus(jobId);
    const status = mapCrawlStatusResponse(body);
    if (!status) {
      return { bundle: currentBundle, terminal: false };
    }

    jobDetailsCache.set(jobId, mapCrawlStatusToJob(source, jobId, status));
    const updatedSource = applyCrawlStatusToSource(source, {
      progress: status.progress,
      pipelineStatus: status.pipelineStatus,
      isTrained: status.isTrained,
      trainedAt: status.trainedAt,
      isSearchReady: status.isSearchReady,
      status: status.status,
      statusMessage: status.statusMessage,
    });
    const sources = currentBundle.sources.map((item) => (item.id === sourceId ? updatedSource : item));
    const bundle = mergeSourcesAndDocuments(sources, currentBundle.documents);
    const terminal = isCrawlStatusTerminal({
      pipelineStatus: status.pipelineStatus,
      status: status.status,
      progress: status.progress,
    });

    return { bundle, terminal };
  } catch (error: unknown) {
    const statusCode =
      error && typeof error === 'object' && 'response' in error
        ? (error as { response?: { status?: number } }).response?.status
        : undefined;
    if (statusCode === 404) {
      const sources = currentBundle.sources.map((item) =>
        item.id === sourceId ? { ...item, active_job_id: null } : item,
      );
      return { bundle: mergeSourcesAndDocuments(sources, currentBundle.documents), terminal: true };
    }
    return { bundle: currentBundle, terminal: false };
  }
}

export function bundleHasInFlightCrawls(bundle: CrawlBundle | null): boolean {
  if (!bundle) return false;
  return bundle.sources.some((source) => isPipelineInFlight(source.pipeline_status));
}

export { bundleHasProcessingDocuments } from '@/features/crawl/utils/crawl-document-status';

export function gmailHasRunningJobs(jobs: GmailSyncJob[]): boolean {
  return jobs.some((job) => job.status === 'PENDING' || job.status === 'RUNNING');
}

export async function fetchCrawlBundle(): Promise<CrawlBundle> {
  const result = await fetchCrawlBundleAndCoverage();
  return result.bundle;
}

export type CrawlBundleLoadResult = {
  bundle: CrawlBundle;
  coverage: ReturnType<typeof parseEmbeddingItemCoverage>;
  embeddingTargetOptions: CrawlEmbeddingTargetOptions | null;
};

/** Parallel fetch: sites + documents + coverage + embedding target options. */
export async function fetchCrawlBundleAndCoverage(): Promise<CrawlBundleLoadResult> {
  const projectId = activeProjectId;
  const [sources, docsBody, coverageBody, embeddingTargetOptions] = await Promise.all([
    fetchSourcesFromApi(),
    handleGetDocuments(),
    projectId
      ? tryRead(() => handleGetProjectEmbeddingItemCoverage(projectId, 'chat'))
      : Promise.resolve(null),
    fetchCrawlEmbeddingTargetOptions(),
  ]);
  const coverage = coverageBody ? parseEmbeddingItemCoverage(coverageBody) : null;
  const coverageById = buildCoverageByDocumentId(coverage);
  const documents = mapApiDocumentsList(docsBody, coverageById);
  const bundle = await buildBundle(sources, documents);
  return { bundle, coverage, embeddingTargetOptions };
}

/** Refresh sources/jobs only; keep in-memory documents (source mutations don't change docs). */
export async function fetchSourcesBundle(
  existingDocuments: CrawlBundle['documents'],
): Promise<CrawlBundle> {
  const sources = await fetchSourcesFromApi();
  return buildBundle(sources, existingDocuments);
}

export async function fetchGmailState(inboxOffset = 0, inboxLimit = 50): Promise<CrawlGmailState> {
  const projectId = requireProjectId();
  const [credentials, integration, jobs] = await Promise.all([
    handleGetGmailCredentialStatus(projectId),
    handleGetGmailStatus(projectId),
    handleGetGmailJobs(projectId),
  ]);
  const inbox = integration
    ? await handleListGmailInbox(projectId, inboxLimit, inboxOffset)
    : { total: 0, items: [] };

  return { credentials, integration, jobs, inbox };
}

export async function fetchGmailStatus(): Promise<CrawlGmailState> {
  return fetchGmailState();
}

export async function saveGmailCredentials(credentials: GmailCredentials): Promise<CrawlGmailState> {
  const projectId = requireProjectId();
  const saved = await handleUpsertGmailCredentials({
    project_id: projectId,
    client_id: credentials.clientId.trim(),
    client_secret: credentials.clientSecret.trim(),
    redirect_uri: credentials.redirectUri.trim(),
  });
  const state = await fetchGmailState();
  return { ...state, credentials: saved };
}

export async function connectGmail(): Promise<void> {
  const projectId = requireProjectId();
  const authUrl = await handleGetGmailAuthUrl(projectId);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const w = 500;
    const h = 600;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(authUrl, 'gmail-oauth', `width=${w},height=${h},left=${left},top=${top}`);
    return;
  }
  const supported = await Linking.canOpenURL(authUrl);
  if (!supported) throw new Error('errors.gmail.authUrlUnsupported');
  await Linking.openURL(authUrl);
}

export async function syncGmail(): Promise<CrawlGmailState> {
  const projectId = requireProjectId();
  await handleTriggerGmailSync(projectId);
  return fetchGmailState();
}

export async function pauseGmail(): Promise<CrawlGmailState> {
  const projectId = requireProjectId();
  await handlePauseGmail(projectId);
  return fetchGmailState();
}

export async function resumeGmail(): Promise<CrawlGmailState> {
  const projectId = requireProjectId();
  await handleResumeGmail(projectId);
  return fetchGmailState();
}

export async function disconnectGmail(): Promise<CrawlGmailState> {
  const projectId = requireProjectId();
  await handleDisconnectGmail(projectId);
  return {
    credentials: { configured: false },
    integration: null,
    jobs: [],
    inbox: { total: 0, items: [] },
  };
}

export async function fetchGmailInbox(offset = 0, limit = 50): Promise<GmailInboxPage> {
  const projectId = requireProjectId();
  return handleListGmailInbox(projectId, limit, offset);
}

export async function indexGmailInbox(stagedIds: string[], allInbox = false): Promise<GmailInboxIndexResult> {
  const projectId = requireProjectId();
  return handleIndexGmailInbox(projectId, stagedIds, allInbox);
}

export async function dismissGmailInbox(stagedIds: string[], allInbox = false): Promise<{ removed: number }> {
  const projectId = requireProjectId();
  return handleDismissGmailInbox(projectId, stagedIds, allInbox);
}

export async function fetchGmailJobs(): Promise<GmailSyncJob[]> {
  const projectId = requireProjectId();
  return handleGetGmailJobs(projectId);
}

export async function addCrawlSource(
  payload: AddSourcePayload,
  existingDocuments: CrawlBundle['documents'] = [],
): Promise<CrawlBundle> {
  await handleAddCrawlSite({
    ...payload,
    base_url: normalizeCrawlUrl(payload.base_url),
  });
  return fetchSourcesBundle(existingDocuments);
}

export async function updateCrawlSource(
  sourceId: string,
  payload: AddSourcePayload,
  existingDocuments: CrawlBundle['documents'] = [],
): Promise<CrawlBundle> {
  await handleUpdateCrawlSite(sourceId, {
    ...payload,
    base_url: normalizeCrawlUrl(payload.base_url),
  });
  return fetchSourcesBundle(existingDocuments);
}

export async function deleteCrawlSource(
  sourceId: string,
  existingDocuments: CrawlBundle['documents'] = [],
): Promise<CrawlBundle> {
  await handleDeleteCrawlSite(sourceId);
  // Refresh sources only (documents unchanged) — faster than a full documents refetch.
  const sources = await fetchSourcesFromApi();
  return buildBundle(sources, existingDocuments);
}

export async function toggleSourceActive(
  sourceId: string,
  existingDocuments: CrawlBundle['documents'] = [],
): Promise<CrawlBundle> {
  const sources = await fetchSourcesFromApi();
  const source = sources.find((item) => item.id === sourceId);
  if (!source) throw new Error('errors.crawl.sourceNotFound');
  await handleUpdateCrawlSite(sourceId, {
    name: source.name,
    base_url: source.base_url,
    depth: source.depth,
    cadence: source.cadence,
    headless_mode: source.headless_mode,
    description: source.description,
    skip_header_footer: source.skip_header_footer,
    rescope_root_links: source.rescope_root_links,
    allowlist: source.allowlist,
    denylist: source.denylist,
  });
  return fetchSourcesBundle(existingDocuments);
}

export type CrawlStartOutcome = {
  bundle: CrawlBundle;
  enqueueStatus?: string | null;
};

export async function runCrawlOnSource(sourceId: string): Promise<CrawlStartOutcome> {
  const response = await handleStartCrawl(sourceId);
  const jobId = extractStartCrawlJobId(response);
  const enqueueStatus = extractCrawlEnqueueStatus(response);

  let sources = await fetchSourcesFromApi();

  if (jobId) {
    pruneJobDetailsCacheForSource(sourceId, jobId);
    sources = sources.map((source) =>
      source.id === sourceId
        ? {
            ...source,
            latest_job_id: jobId,
            active_job_id: jobId,
            pipeline_status: 'queued' as const,
            progress_percentage: 0,
          }
        : source,
    );

    const source = sources.find((item) => item.id === sourceId);
    if (source) {
      try {
        const statusBody = await handleGetCrawlStatus(jobId);
        const status = mapCrawlStatusResponse(statusBody);
        if (status) {
          jobDetailsCache.set(jobId, mapCrawlStatusToJob(source, jobId, status));
          sources = sources.map((item) =>
            item.id === sourceId
              ? applyCrawlStatusToSource(source, {
                  progress: status.progress,
                  pipelineStatus: status.pipelineStatus,
                  isTrained: status.isTrained,
                  trainedAt: status.trainedAt,
                  isSearchReady: status.isSearchReady,
                  status: status.status,
                  statusMessage: status.statusMessage,
                })
              : item,
          );
        }
      } catch {
        // Initial status fetch is best-effort (reference web frontend).
      }
    }
  }

  const documents = await fetchDocumentsFromApi();
  const bundle = mergeSourcesAndDocuments(sources, documents);
  return { bundle, enqueueStatus };
}

function resolveUploadFiles(payload: DocumentFormPayload) {
  if (payload.files?.length) {
    return payload.files.map((file) => {
      if (typeof File !== 'undefined' && file instanceof File) return file;
      return file as { uri: string; name: string; mimeType?: string };
    });
  }
  return payload.fileNames.map((name) => ({
    uri: name,
    name,
    mimeType: inferMimeType(name),
  }));
}

export async function uploadDocuments(payload: DocumentFormPayload): Promise<CrawlBundle> {
  const files = resolveUploadFiles(payload);
  if (files.length === 0) throw new Error('errors.documents.chooseFile');

  const collection = payload.sourceLabel.trim() || (payload.uploadAsFolder ? 'manual-uploads' : '');
  const metadata = {
    title: payload.title.trim() || undefined,
    description: payload.description.trim() || undefined,
    language: payload.language,
    source: collection || undefined,
  };

  for (const file of files) {
    const fileName = typeof File !== 'undefined' && file instanceof File ? file.name : file.name;
    await handleUploadDocument(file, {
      ...metadata,
      title: metadata.title ?? fileName,
      source: metadata.source ?? fileName,
    });
  }

  return fetchCrawlBundle();
}

export async function updateDocument(documentId: string, payload: DocumentFormPayload): Promise<CrawlBundle> {
  await handleUpdateDocument(documentId, {
    title: payload.title.trim() || undefined,
    description: payload.description.trim() || undefined,
    language: payload.language,
    source: payload.sourceLabel.trim() || undefined,
  });
  return fetchCrawlBundle();
}

async function sameEmbeddingCollection(projectId: string): Promise<boolean> {
  const [searchStatus, chatStatus] = await Promise.all([
    tryRead(() => handleGetProjectEmbeddingStatus(projectId, 'search')),
    tryRead(() => handleGetProjectEmbeddingStatus(projectId, 'chat')),
  ]);
  if (!searchStatus || !chatStatus) return false;
  const search = searchStatus as Record<string, unknown>;
  const chat = chatStatus as Record<string, unknown>;
  return (
    search.active_collection === chat.active_collection &&
    search.active_provider === chat.active_provider &&
    search.active_model === chat.active_model
  );
}

export async function checkSameEmbeddingCollection(): Promise<boolean> {
  const projectId = activeProjectId;
  if (!projectId) return false;
  return sameEmbeddingCollection(projectId);
}

export async function startDocumentReindex(documentIds: string[]): Promise<ReindexProgress | null> {
  const projectId = requireProjectId();
  const ids = documentIds.filter(Boolean);
  if (ids.length === 0) throw new Error('documents.toast.reindexNoSelection');

  const same = await sameEmbeddingCollection(projectId);
  const opts = { includeCrawled: false as const, documentIds: ids };
  // When Search/Chat share a collection, reindex via chat so the preferred ingest
  // API key is used (Search often stores an LLM proxy key in the same field).
  const tasks: Promise<unknown>[] = same
    ? [handlePostProjectReindex(projectId, 'chat', opts)]
    : [
        handlePostProjectReindex(projectId, 'search', opts),
        handlePostProjectReindex(projectId, 'chat', opts),
      ];

  const results = await Promise.allSettled(tasks);
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<unknown> => r.status === 'fulfilled');
  if (fulfilled.length === 0) {
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    throw rejected?.reason ?? new Error('Re-index failed.');
  }

  const raw = fulfilled[0].value;
  return raw ? parseReindexProgress(raw) : null;
}

export async function fetchDocumentReindexProgress(source: EmbeddingSource = 'search'): Promise<ReindexProgress | null> {
  const projectId = activeProjectId;
  if (!projectId) return null;
  const raw = await tryRead(() => handleGetProjectReindexProgress(projectId, source));
  return raw ? parseReindexProgress(raw) : null;
}

export async function reindexDocument(documentId: string): Promise<ReindexProgress | null> {
  return startDocumentReindex([documentId]);
}

export async function bulkReindexDocuments(documentIds: string[]): Promise<ReindexProgress | null> {
  return startDocumentReindex(documentIds);
}

export async function deleteDocument(documentId: string): Promise<CrawlBundle> {
  await handleDeleteDocument(documentId);
  return fetchCrawlBundle();
}

export async function bulkDeleteDocuments(documentIds: string[]): Promise<CrawlBundle> {
  await Promise.all(documentIds.map((id) => handleDeleteDocument(id)));
  return fetchCrawlBundle();
}

export async function refreshCrawlJob(jobId: string): Promise<CrawlBundle> {
  const sources = await fetchSourcesFromApi();
  const source = sources.find((item) => item.latest_job_id === jobId || item.active_job_id === jobId);
  if (!source) throw new Error('errors.crawl.jobNotFound');

  const body = await handleGetCrawlStatus(jobId);
  const status = mapCrawlStatusResponse(body);
  if (!status) throw new Error('errors.crawl.jobStatusFailed');

  jobDetailsCache.set(jobId, mapCrawlStatusToJob(source, jobId, status));
  const documents = await fetchDocumentsFromApi();
  return buildBundle(sources, documents);
}

export async function openDocumentWithToken(documentId: string, mimeType: string): Promise<boolean> {
  try {
    const token = await handleGetDocumentContentToken(documentId);
    // Always use API base (not Expo web origin) — content-stream lives on the backend.
    const url = `${buildApiUrl(API_CONFIG.documentContentStream(documentId))}?token=${encodeURIComponent(token)}`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
      return true;
    }

    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function fetchEmbeddingItemCoverage() {
  const projectId = activeProjectId;
  if (!projectId) return null;
  const raw = await tryRead(() => handleGetProjectEmbeddingItemCoverage(projectId, 'chat'));
  return raw ? parseEmbeddingItemCoverage(raw) : null;
}

export type DocumentChunk = {
  chunk_index: number;
  text: string;
  metadata: Record<string, unknown>;
};

export type DocumentChunksPage = {
  chunks: DocumentChunk[];
  total: number;
  has_more: boolean;
};

export type { CrawlUrlPreview };

export async function buildDocumentContentStreamUrl(documentId: string): Promise<string> {
  const token = await handleGetDocumentContentToken(documentId);
  // Backend hosts content-stream; Expo web at :8081 has no matching route (Unmatched Route).
  return `${buildApiUrl(API_CONFIG.documentContentStream(documentId))}?token=${encodeURIComponent(token)}`;
}

export async function fetchDocumentContentBlob(
  documentId: string,
): Promise<{ data: ArrayBuffer; mimeType: string }> {
  const response = await fetchWithAuth(API_CONFIG.documentContent(documentId));
  if (!response.ok) {
    throw new Error('errors.documents.loadContentFailed');
  }
  const mimeType =
    response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'application/octet-stream';
  const data = await response.arrayBuffer();
  return { data, mimeType };
}

export async function previewCrawlUrl(url: string): Promise<CrawlUrlPreview> {
  const normalized = normalizeCrawlUrl(url);
  const body = await handlePreviewCrawlUrl(normalized);
  return mapCrawlUrlPreviewResponse(body, normalized);
}

export async function fetchDocumentTextContent(documentId: string): Promise<string> {
  // Prefer authenticated blob fetch — axios JSON decoding breaks for raw file bytes.
  const response = await fetchWithAuth(API_CONFIG.documentContent(documentId));
  if (!response.ok) {
    throw new Error('errors.documents.loadContentFailed');
  }
  const text = await response.text();
  if (text.trim()) return text;

  const body = await handleGetDocumentContent(documentId);
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.content === 'string') return record.content;
    if (typeof record.text === 'string') return record.text;
  }
  throw new Error('errors.documents.loadContentFailed');
}

export async function fetchDocumentChunks(
  documentId: string,
  limit = 30,
  offset = 0,
): Promise<DocumentChunksPage> {
  const body = await handleGetDocumentChunks(documentId, limit, offset);
  if (!body || typeof body !== 'object') {
    return { chunks: [], total: 0, has_more: false };
  }
  const raw = body as Record<string, unknown>;
  const chunks = Array.isArray(raw.chunks)
    ? raw.chunks
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const chunk = item as Record<string, unknown>;
          return {
            chunk_index: typeof chunk.chunk_index === 'number' ? chunk.chunk_index : 0,
            text: typeof chunk.text === 'string' ? chunk.text : '',
            metadata:
              chunk.metadata && typeof chunk.metadata === 'object'
                ? (chunk.metadata as Record<string, unknown>)
                : {},
          } satisfies DocumentChunk;
        })
        .filter((item): item is DocumentChunk => item != null)
    : [];
  return {
    chunks,
    total: typeof raw.total === 'number' ? raw.total : chunks.length,
    has_more: Boolean(raw.has_more),
  };
}
