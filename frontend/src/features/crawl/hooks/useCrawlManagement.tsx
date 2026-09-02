import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import { openDocumentPreview } from '@/features/crawl/utils/document-preview';
import { useDocumentUploadProgress } from '@/features/crawl/providers/document-upload-progress-provider';
import {
  addCrawlSource,
  bulkDeleteDocuments,
  bulkReindexDocuments,
  bundleHasInFlightCrawls,
  bundleHasProcessingDocuments,
  checkSameEmbeddingCollection,
  configureCrawlProject,
  connectGmail,
  deleteCrawlSource,
  deleteDocument,
  disconnectGmail,
  dismissGmailInbox,
  fetchCrawlBundleAndCoverage,
  fetchCrawlJobDetail,
  fetchDocumentReindexProgress,
  fetchGmailInbox,
  fetchGmailState,
  fetchEmbeddingItemCoverage,
  gmailHasRunningJobs,
  indexGmailInbox,
  pauseGmail,
  pollCrawlSourceStatus,
  refreshCrawlSourcesOnly,
  resumeGmail,
  runCrawlOnSource,
  saveGmailCredentials,
  syncGmail,
  toggleSourceActive,
  updateCrawlSource,
  updateDocument,
} from '@/features/crawl/services/crawl.service';
import { expandDocumentUploadFiles } from '@/features/crawl/utils/document-upload-queue';
import type {
  AddSourcePayload,
  CrawlActionMenuTarget,
  CrawlBundle,
  CrawlDomainSubTab,
  CrawlEmbeddingTargetOptions,
  CrawlFeedback,
  CrawlGmailState,
  CrawlJob,
  CrawlJobFilters,
  CrawlPrimaryTab,
  CrawlSheet,
  CrawlSourceFilters,
  DocumentFilters,
  DocumentFormPayload,
  DocumentViewMode,
  GmailCredentials,
} from '@/features/crawl/types/crawl.types';
import type { EmbeddingItemCoverage, ReindexProgress } from '@/features/search-config/types/embedding.types';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';
import { canStartCrawlForSite, isPipelineInFlight, jobIdForPolling } from '@/features/crawl/utils/crawl-pipeline-status';
import { isGmailDocument } from '@/features/crawl/utils/document-gmail-utils';
import type { DocumentUploadProgress } from '@/features/crawl/providers/document-upload-progress-provider';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import type { AxiosError } from 'axios';

type CrawlContextValue = {
  bundle: CrawlBundle | null;
  gmail: CrawlGmailState | null;
  gmailLoading: boolean;
  gmailInboxLoadingMore: boolean;
  embeddingCoverage: EmbeddingItemCoverage | null;
  embeddingTargetOptions: CrawlEmbeddingTargetOptions | null;
  reindexProgress: ReindexProgress | null;
  reindexPollMask: { search: boolean; chat: boolean } | null;
  reindexPollSnapshot: { search: ReindexProgress | null; chat: ReindexProgress | null };
  reindexingDocuments: boolean;
  documentUploadProgress: DocumentUploadProgress | null;
  isUploadingDocuments: boolean;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  jobDetailLoading: boolean;
  jobDetailSnapshot: CrawlJob | null;
  jobDetailError: string | null;
  error: string | null;
  feedback: CrawlFeedback;
  primaryTab: CrawlPrimaryTab;
  domainSubTab: CrawlDomainSubTab;
  sourceFilters: CrawlSourceFilters;
  jobFilters: CrawlJobFilters;
  documentFilters: DocumentFilters;
  documentView: DocumentViewMode;
  selectedDocumentIds: string[];
  gmailStagedSelected: string[];
  gmailAllInboxSelected: boolean;
  activeSheet: CrawlSheet;
  actionMenu: CrawlActionMenuTarget;
  setPrimaryTab: (tab: CrawlPrimaryTab) => void;
  setDomainSubTab: (tab: CrawlDomainSubTab) => void;
  setSourceFilters: (filters: CrawlSourceFilters) => void;
  setJobFilters: (filters: CrawlJobFilters) => void;
  setDocumentFilters: (filters: DocumentFilters) => void;
  setDocumentView: (mode: DocumentViewMode) => void;
  toggleDocumentSelection: (id: string) => void;
  selectAllDocuments: (documentIds: string[]) => void;
  toggleSelectAllFilteredDocuments: (documentIds: string[]) => void;
  clearDocumentSelection: () => void;
  toggleGmailStagedSelection: (id: string) => void;
  selectVisibleGmailInbox: () => void;
  selectAllGmailInbox: () => void;
  clearGmailSelection: () => void;
  openSheet: (sheet: CrawlSheet) => void;
  closeSheet: () => void;
  openActionMenu: (target: CrawlActionMenuTarget) => void;
  closeActionMenu: () => void;
  refresh: () => Promise<void>;
  refreshGmail: () => Promise<void>;
  loadMoreGmailInbox: () => Promise<void>;
  clearFeedback: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
  handleSubmitSource: (payload: AddSourcePayload) => Promise<void>;
  handleUploadDocument: (payload: DocumentFormPayload) => Promise<void>;
  handleUpdateDocument: (payload: DocumentFormPayload) => Promise<void>;
  handleReindexDocument: (documentId: string) => Promise<void>;
  handleOpenDocument: (documentId: string) => Promise<void>;
  handleSaveGmail: (credentials: GmailCredentials) => Promise<void>;
  handleConnectGmail: () => Promise<void>;
  handleSyncGmail: () => Promise<void>;
  handlePauseGmail: () => Promise<void>;
  handleResumeGmail: () => Promise<void>;
  handleDisconnectGmail: () => Promise<void>;
  handleIndexGmailInbox: () => Promise<void>;
  handleDismissGmailInbox: () => Promise<void>;
  handleRefreshJob: (jobId: string) => Promise<void>;
  handleRunSource: (sourceId: string) => Promise<void>;
  handleToggleSource: (sourceId: string) => Promise<void>;
  handleDeleteSource: (sourceId: string) => Promise<void>;
  handleDeleteDocument: (documentId: string) => Promise<void>;
  handleBulkReindexDocuments: (documentIds: string[]) => Promise<void>;
  handleBulkDeleteDocuments: (documentIds: string[]) => Promise<void>;
  handleViewDocument: (documentId: string) => void;
  handleInspectDocument: (documentId: string) => void;
  handleEditDocument: (documentId: string) => void;
};

const CrawlContext = createContext<CrawlContextValue | null>(null);

// Poll more conservatively — heavy jobs still get updates, but idle pages don't hammer the API.
const CRAWL_POLL_MS = 10_000;
const GMAIL_POLL_MS = 10000;
const REINDEX_POLL_MS = 2000;

function isActiveReindex(status: ReindexProgress['status'] | undefined) {
  return status === 'running' || status === 'started';
}

function isTerminalReindex(status: ReindexProgress['status'] | undefined) {
  return status === 'done' || status === 'completed_with_errors' || status === 'error';
}

function isInFlightReindex(progress: ReindexProgress | null | undefined): boolean {
  return progress != null && isActiveReindex(progress.status);
}

function reindexDoneCount(progress: ReindexProgress | null | undefined): number {
  if (!progress) return 0;
  return progress.embedded + progress.skipped + progress.failed;
}

function parseGmailConnectedFromUrl(url: string): boolean {
  try {
    const parsed = new URL(url, 'https://placeholder.local');
    return parsed.searchParams.get('gmail') === 'connected';
  } catch {
    return /[?&]gmail=connected\b/.test(url);
  }
}

type Props = {
  children: React.ReactNode;
};

export function CrawlProvider({ children }: Props) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { activeProjectId } = useActiveProject();
  const { progress: documentUploadProgress, isUploading: isUploadingDocuments, uploadBatch } =
    useDocumentUploadProgress();
  const [bundle, setBundle] = useState<CrawlBundle | null>(null);
  const [gmail, setGmail] = useState<CrawlGmailState | null>(null);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [gmailInboxLoadingMore, setGmailInboxLoadingMore] = useState(false);
  const [embeddingCoverage, setEmbeddingCoverage] = useState<EmbeddingItemCoverage | null>(null);
  const [embeddingTargetOptions, setEmbeddingTargetOptions] = useState<CrawlEmbeddingTargetOptions | null>(null);
  const [reindexProgress, setReindexProgress] = useState<ReindexProgress | null>(null);
  const [reindexPollMask, setReindexPollMask] = useState<{ search: boolean; chat: boolean } | null>(null);
  const [reindexPollSnapshot, setReindexPollSnapshot] = useState<{
    search: ReindexProgress | null;
    chat: ReindexProgress | null;
  }>({ search: null, chat: null });
  const [reindexingDocuments, setReindexingDocuments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobDetailLoading, setJobDetailLoading] = useState(false);
  const [jobDetailSnapshot, setJobDetailSnapshot] = useState<CrawlJob | null>(null);
  const [jobDetailError, setJobDetailError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<CrawlFeedback>(null);
  const [primaryTab, setPrimaryTab] = useState<CrawlPrimaryTab>('domain');
  const [domainSubTab, setDomainSubTab] = useState<CrawlDomainSubTab>('sources');
  const [sourceFilters, setSourceFilters] = useState<CrawlSourceFilters>({ query: '', status: 'all', cadence: 'all' });
  const [jobFilters, setJobFilters] = useState<CrawlJobFilters>({ query: '', status: 'all' });
  const [documentFilters, setDocumentFilters] = useState<DocumentFilters>({ query: '', type: 'all', status: 'all' });
  const [documentView, setDocumentView] = useState<DocumentViewMode>('grid');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [gmailStagedSelected, setGmailStagedSelected] = useState<string[]>([]);
  const [gmailAllInboxSelected, setGmailAllInboxSelected] = useState(false);
  const [activeSheet, setActiveSheet] = useState<CrawlSheet>(null);
  const [actionMenu, setActionMenu] = useState<CrawlActionMenuTarget>(null);
  const saveLockRef = useRef(false);
  const successFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSuccessFeedbackRef = useRef<{ message: string; at: number } | null>(null);
  const bundleRef = useRef(bundle);
  bundleRef.current = bundle;
  const primaryTabRef = useRef(primaryTab);
  primaryTabRef.current = primaryTab;

  useEffect(() => {
    configureCrawlProject(activeProjectId);
  }, [activeProjectId]);

  const notify = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    if (type === 'error') {
      setFeedback({ type: 'error', message });
      return;
    }
    const now = Date.now();
    const last = lastSuccessFeedbackRef.current;
    if (!last || last.message !== message || now - last.at > 1800) {
      setFeedback({ type: 'success', message });
      lastSuccessFeedbackRef.current = { message, at: now };
    }
  }, []);

  const loadCoverage = useCallback(async () => {
    const coverage = await fetchEmbeddingItemCoverage();
    setEmbeddingCoverage(coverage);
  }, []);

  const loadGmail = useCallback(async () => {
    if (!activeProjectId) {
      setGmail(null);
      return;
    }
    setGmailLoading(true);
    try {
      const state = await fetchGmailState();
      setGmail(state);
    } catch {
      // Gmail errors are surfaced via action handlers; keep prior state on poll failures.
    } finally {
      setGmailLoading(false);
    }
  }, [activeProjectId]);

  const handleGmailConnectedCallback = useCallback(() => {
    setPrimaryTab('gmail');
    void loadGmail();
    notify(t('gmail.toast.connected'));
  }, [loadGmail, notify]);

  const loadMoreGmailInbox = useCallback(async () => {
    if (!gmail || gmailInboxLoadingMore) return;
    const loadedCount = gmail.inbox.items.length;
    if (loadedCount >= gmail.inbox.total) return;
    setGmailInboxLoadingMore(true);
    try {
      const page = await fetchGmailInbox(loadedCount);
      setGmail((current) => {
        if (!current) return current;
        const existingIds = new Set(current.inbox.items.map((item) => item.id));
        const appended = page.items.filter((item) => !existingIds.has(item.id));
        return {
          ...current,
          inbox: {
            total: page.total,
            items: [...current.inbox.items, ...appended],
          },
        };
      });
    } catch {
      // Keep current inbox on pagination failures.
    } finally {
      setGmailInboxLoadingMore(false);
    }
  }, [gmail, gmailInboxLoadingMore]);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (!activeProjectId) {
        setBundle(null);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        // Single 3-way parallel: sites + documents + coverage (no duplicate coverage call).
        const { bundle: data, coverage, embeddingTargetOptions: options } =
          await fetchCrawlBundleAndCoverage();
        setBundle(data);
        setEmbeddingCoverage(coverage);
        setEmbeddingTargetOptions(options);
        if (primaryTabRef.current === 'gmail') {
          await loadGmail();
        }
      } catch {
        setError(t('crawl.error.loadFailed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeProjectId, loadGmail]
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (primaryTab === 'document' || primaryTab === 'gmail') {
      void load('refresh');
    }
    if (primaryTab === 'gmail') {
      void loadGmail();
    }
  }, [primaryTab, load, loadGmail]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const current = bundleRef.current;
      if (!current || !bundleHasInFlightCrawls(current)) return;
      void refreshCrawlSourcesOnly(current)
        .then((next) => setBundle(next))
        .catch(() => {});
    }, CRAWL_POLL_MS);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      const current = bundleRef.current;
      if (!current) return;

      const inFlight = current.sources.filter((source) => jobIdForPolling(source));
      if (inFlight.length === 0) return;

      inFlight.forEach((source) => {
        const jobId = jobIdForPolling(source);
        if (!jobId) return;

        void pollCrawlSourceStatus(bundleRef.current ?? current, source.id, jobId)
          .then(({ bundle: patched, terminal }) => {
            setBundle((prev) => {
              if (!prev) return patched;
              const sourceMap = new Map(patched.sources.map((item) => [item.id, item]));
              const sources = prev.sources.map((item) => sourceMap.get(item.id) ?? item);
              return { ...patched, sources, documents: prev.documents };
            });
            if (terminal) {
              void fetchCrawlBundleAndCoverage()
                .then(({ bundle: next, coverage, embeddingTargetOptions: options }) => {
                  setBundle(next);
                  setEmbeddingCoverage(coverage);
                  setEmbeddingTargetOptions(options);
                })
                .catch(() => {});
            }
          })
          .catch(() => {});
      });
    }, CRAWL_POLL_MS);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (primaryTab !== 'document') return;
    if (!bundleHasProcessingDocuments(bundle)) return;
    const intervalId = setInterval(() => {
      void load('refresh');
    }, CRAWL_POLL_MS);
    return () => clearInterval(intervalId);
  }, [primaryTab, bundle, load]);

  useEffect(() => {
    if (!gmail || !gmailHasRunningJobs(gmail.jobs)) return;
    const intervalId = setInterval(() => {
      void loadGmail();
    }, GMAIL_POLL_MS);
    return () => clearInterval(intervalId);
  }, [gmail, loadGmail]);

  useEffect(() => {
    if (!reindexPollMask || !activeProjectId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const [searchProgress, chatProgress] = await Promise.all([
          reindexPollMask.search ? fetchDocumentReindexProgress('search') : Promise.resolve(null),
          reindexPollMask.chat ? fetchDocumentReindexProgress('chat') : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const nextSnapshot = {
          search: reindexPollMask.search ? searchProgress : null,
          chat: reindexPollMask.chat ? chatProgress : null,
        };
        setReindexPollSnapshot(nextSnapshot);
        if (searchProgress) setReindexProgress(searchProgress);

        const searchDone = !reindexPollMask.search || isTerminalReindex(searchProgress?.status);
        const chatDone = !reindexPollMask.chat || isTerminalReindex(chatProgress?.status);
        if (!searchDone || !chatDone) return;

        setReindexingDocuments(false);
        setReindexPollMask(null);
        setReindexPollSnapshot({ search: null, chat: null });
        await load('refresh');

        const failedTotal = (searchProgress?.failed ?? 0) + (chatProgress?.failed ?? 0);
        const hasError =
          searchProgress?.status === 'error' ||
          chatProgress?.status === 'error' ||
          searchProgress?.status === 'completed_with_errors' ||
          chatProgress?.status === 'completed_with_errors' ||
          failedTotal > 0;

        notify(
          hasError ? t('documents.toast.reindexCompleteWithErrors') : t('documents.toast.reindexComplete'),
          hasError ? 'error' : 'success'
        );
      } catch {
        if (!cancelled) {
          setReindexingDocuments(false);
          setReindexPollMask(null);
          setReindexPollSnapshot({ search: null, chat: null });
        }
      }
    };
    void tick();
    const intervalId = setInterval(tick, REINDEX_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [reindexPollMask, activeProjectId, load, notify]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    void (async () => {
      try {
        const same = await checkSameEmbeddingCollection();
        const [searchProgress, chatProgress] = await Promise.all([
          fetchDocumentReindexProgress('search'),
          fetchDocumentReindexProgress('chat'),
        ]);
        if (cancelled) return;

        if (same) {
          if (!isInFlightReindex(searchProgress) && !isInFlightReindex(chatProgress)) return;
          setReindexPollMask({ search: true, chat: false });
          setReindexPollSnapshot({
            search: isInFlightReindex(searchProgress) ? searchProgress : chatProgress,
            chat: null,
          });
        } else {
          const pollSearch = isInFlightReindex(searchProgress);
          const pollChat = isInFlightReindex(chatProgress);
          if (!pollSearch && !pollChat) return;
          setReindexPollMask({ search: pollSearch, chat: pollChat });
          setReindexPollSnapshot({ search: searchProgress, chat: chatProgress });
        }
        setReindexingDocuments(true);
      } catch {
        /* keep UI idle */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'gmail_connected') {
        handleGmailConnectedCallback();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handleGmailConnectedCallback]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('gmail') === 'connected') {
        handleGmailConnectedCallback();
        const url = new URL(window.location.href);
        url.searchParams.delete('gmail');
        window.history.replaceState({}, '', url.toString());
      }
      return;
    }

    const onUrl = (event: { url: string }) => {
      if (parseGmailConnectedFromUrl(event.url)) {
        handleGmailConnectedCallback();
      }
    };
    const subscription = Linking.addEventListener('url', onUrl);
    void Linking.getInitialURL().then((url) => {
      if (url && parseGmailConnectedFromUrl(url)) {
        handleGmailConnectedCallback();
      }
    });
    return () => subscription.remove();
  }, [handleGmailConnectedCallback]);

  useEffect(() => {
    const ids = new Set((gmail?.inbox.items ?? []).map((item) => item.id));
    setGmailStagedSelected((current) => {
      const next = current.filter((id) => ids.has(id));
      return next.length === current.length ? current : next;
    });
  }, [gmail?.inbox.items]);

  useEffect(() => {
    if (successFeedbackTimeoutRef.current) {
      clearTimeout(successFeedbackTimeoutRef.current);
      successFeedbackTimeoutRef.current = null;
    }
    if (feedback?.type !== 'success') return;
    successFeedbackTimeoutRef.current = setTimeout(() => {
      setFeedback((current) => (current?.type === 'success' ? null : current));
      successFeedbackTimeoutRef.current = null;
    }, 2500);
    return () => {
      if (successFeedbackTimeoutRef.current) {
        clearTimeout(successFeedbackTimeoutRef.current);
        successFeedbackTimeoutRef.current = null;
      }
    };
  }, [feedback]);

  const runSave = useCallback(
    async (
      action: () => Promise<CrawlBundle>,
      successMessage: string,
      closeOnSuccess = true,
      options?: { refreshCoverageInBackground?: boolean },
    ): Promise<boolean> => {
      if (saveLockRef.current) {
        notify(t('common.saveInProgress'), 'error');
        return false;
      }
      saveLockRef.current = true;
      setSaving(true);
      setFeedback(null);
      try {
        if (options?.refreshCoverageInBackground) {
          // Deletes: return UI as soon as DB delete + bundle refresh finish.
          // Coverage/embedding scan can catch up without blocking the toast.
          const next = await action();
          setBundle(next);
          notify(successMessage);
          if (closeOnSuccess) setActiveSheet(null);
          void loadCoverage();
          return true;
        }
        // action() returns an already-refreshed bundle; loadCoverage in parallel.
        const [next] = await Promise.all([action(), loadCoverage()]);
        setBundle(next);
        notify(successMessage);
        if (closeOnSuccess) setActiveSheet(null);
        return true;
      } catch (err) {
        setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'common.saveFailed') });
        return false;
      } finally {
        setSaving(false);
        saveLockRef.current = false;
      }
    },
    [notify, loadCoverage, t]
  );

  const beginReindex = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0) return;
      setSaving(true);
      setFeedback(null);
      try {
        const same = await checkSameEmbeddingCollection();
        const progress = await bulkReindexDocuments(documentIds);
        // Shared collection → Documents reindex runs chat only (preferred key).
        setReindexPollMask(same ? { search: false, chat: true } : { search: true, chat: true });
        setReindexPollSnapshot(
          same ? { search: null, chat: progress } : { search: progress, chat: null },
        );
        setReindexingDocuments(true);
        if (progress) setReindexProgress(progress);
        notify(t('documents.toast.reindexStartedShort'));
      } catch (err) {
        setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'common.saveFailed') });
      } finally {
        setSaving(false);
      }
    },
    [notify]
  );

  const handleSubmitSource = useCallback(
    async (payload: AddSourcePayload) => {
      const docs = bundleRef.current?.documents ?? [];
      if (activeSheet?.type === 'edit-source') {
        await runSave(
          () => updateCrawlSource(activeSheet.sourceId, payload, docs),
          t('crawl.toast.sourceUpdated'),
        );
        return;
      }
      await runSave(() => addCrawlSource(payload, docs), t('crawl.toast.sourceAdded'));
    },
    [activeSheet, runSave]
  );

  const handleUploadDocument = useCallback(
    async (payload: DocumentFormPayload) => {
      if (!payload.files?.length && payload.fileNames.length === 0) {
        setFeedback({ type: 'error', message: t('documents.upload.chooseFileError') });
        return;
      }

      setFeedback(null);
      try {
        const rawFiles = payload.files ?? [];
        const { queue, skipped } =
          Platform.OS === 'web' && rawFiles.length > 0
            ? await expandDocumentUploadFiles(rawFiles)
            : {
                queue: rawFiles.map((file, index) => ({
                  file,
                  relPath: ('name' in file ? file.name : (file as File).name) || payload.fileNames[index] || `file-${index}`,
                })),
                skipped: 0,
              };

        if (queue.length === 0) {
          setFeedback({
            type: 'error',
            message:
              skipped > 0
                ? t('documents.upload.allSkipped')
                : t('documents.upload.chooseFileError'),
          });
          return;
        }

        const collection = payload.sourceLabel.trim() || (payload.uploadAsFolder ? 'manual-uploads' : '');
        const metadata = {
          title: payload.title.trim() || undefined,
          description: payload.description.trim() || undefined,
          language: payload.language,
          source: collection || undefined,
        };

        const result = await uploadBatch({
          queue,
          metadata,
          onAfterEachUpload: () => {
            void load('refresh');
          },
        });

        if (result.status === 'skipped') {
          notify(t('documents.upload.alreadyInProgress'), 'error');
          return;
        }

        const next = await fetchCrawlBundleAndCoverage();
        setBundle(next.bundle);
        setEmbeddingCoverage(next.coverage);
        setEmbeddingTargetOptions(next.embeddingTargetOptions);

        if (result.failedFiles.length === 0) {
          notify(t('documents.toast.uploaded.description'));
          setActiveSheet(null);
          return;
        }

        const summary =
          result.failedFiles.length === result.total
            ? t('documents.upload.summaryAllFailed', { total: result.total })
            : t('documents.upload.summaryPartial', {
                succeeded: result.succeeded,
                total: result.total,
                failed: result.failedFiles.length,
              });
        const detail = result.failedFiles
          .slice(0, 3)
          .map((file) => `${file.name}: ${file.reason}`)
          .join(' ');
        notify(`${summary} ${detail}`, result.succeeded > 0 ? 'success' : 'error');
        if (result.succeeded > 0) {
          setActiveSheet(null);
        }
      } catch (err) {
        setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'common.saveFailed') });
      }
    },
    [load, notify, uploadBatch],
  );

  const handleUpdateDocument = useCallback(
    async (payload: DocumentFormPayload) => {
      if (activeSheet?.type !== 'edit-document') return;
      await runSave(() => updateDocument(activeSheet.documentId, payload), t('documents.toast.updated.description'));
    },
    [activeSheet, runSave]
  );

  const runGmailAction = useCallback(
    async (action: () => Promise<CrawlGmailState>, successMessage: string) => {
      setSaving(true);
      setFeedback(null);
      try {
        const next = await action();
        setGmail(next);
        notify(successMessage);
      } catch (err) {
        setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'common.saveFailed') });
      } finally {
        setSaving(false);
      }
    },
    [notify]
  );

  const handleSaveGmail = useCallback(
    async (credentials: GmailCredentials) => {
      await runGmailAction(() => saveGmailCredentials(credentials), t('gmail.toast.credentialsSaved'));
    },
    [runGmailAction]
  );

  const handleConnectGmail = useCallback(async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await connectGmail();
      notify(t('gmail.toast.authOpened'));
    } catch (err) {
      setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'common.saveFailed') });
    } finally {
      setSaving(false);
    }
  }, [notify, t]);

  const handleSyncGmail = useCallback(async () => {
    await runGmailAction(() => syncGmail(), t('gmail.toast.syncStarted'));
  }, [runGmailAction]);

  const handlePauseGmail = useCallback(async () => {
    await runGmailAction(() => pauseGmail(), t('gmail.toast.autoSyncPaused'));
  }, [runGmailAction]);

  const handleResumeGmail = useCallback(async () => {
    await runGmailAction(() => resumeGmail(), t('gmail.toast.autoSyncResumed'));
  }, [runGmailAction]);

  const confirmDisconnectGmail = useCallback((): Promise<boolean> => {
    const message = t('gmail.confirm.disconnectMessage');
    return confirm({
      title: t('gmail.confirm.disconnectTitle'),
      message,
      cancelLabel: t('common.cancel'),
      confirmLabel: t('common.disconnect'),
      destructive: true,
    });
  }, [confirm, t]);

  const handleDisconnectGmail = useCallback(async () => {
    const confirmed = await confirmDisconnectGmail();
    if (!confirmed) return;
    await runGmailAction(() => disconnectGmail(), t('gmail.toast.disconnected'));
    setGmailStagedSelected([]);
    setGmailAllInboxSelected(false);
  }, [confirmDisconnectGmail, runGmailAction]);

  const handleIndexGmailInbox = useCallback(async () => {
    const ids = gmailAllInboxSelected ? [] : gmailStagedSelected;
    if (!gmailAllInboxSelected && ids.length === 0) return;
    setSaving(true);
    try {
      const result = await indexGmailInbox(ids, gmailAllInboxSelected);
      setGmailStagedSelected([]);
      setGmailAllInboxSelected(false);
      await Promise.all([loadGmail(), load('refresh')]);
      notify(
        result.errors?.length
          ? t('gmail.toast.indexedWithErrors', { indexed: result.indexed, errors: result.errors.length })
          : t('gmail.toast.indexed', { count: result.indexed })
      );
    } catch (err) {
      setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'gmail.toast.indexFailed') });
    } finally {
      setSaving(false);
    }
  }, [gmailAllInboxSelected, gmailStagedSelected, loadGmail, load, notify]);

  const handleDismissGmailInbox = useCallback(async () => {
    const ids = gmailAllInboxSelected ? [] : gmailStagedSelected;
    if (!gmailAllInboxSelected && ids.length === 0) return;
    setSaving(true);
    try {
      await dismissGmailInbox(ids, gmailAllInboxSelected);
      setGmailStagedSelected([]);
      setGmailAllInboxSelected(false);
      await loadGmail();
      notify(t('gmail.toast.dismissed'));
    } catch (err) {
      setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'gmail.toast.dismissFailed') });
    } finally {
      setSaving(false);
    }
  }, [gmailAllInboxSelected, gmailStagedSelected, loadGmail, notify]);

  const handleRefreshJob = useCallback(
    async (jobId: string) => {
      const source = bundleRef.current?.sources.find(
        (item) => item.latest_job_id === jobId || item.active_job_id === jobId,
      );
      if (!source) return;
      setSaving(true);
      try {
        const job = await fetchCrawlJobDetail(jobId, source);
        setJobDetailSnapshot(job);
        notify(t('crawl.toast.jobRefreshed'));
      } catch (err) {
        setFeedback({ type: 'error', message: resolveAppErrorMessage(err, t, 'crawl.error.loadFailed') });
      } finally {
        setSaving(false);
      }
    },
    [notify, t],
  );

  const jobDetailSourceId = activeSheet?.type === 'job-detail' ? activeSheet.sourceId : null;

  const jobDetailJobId = useMemo(() => {
    if (!jobDetailSourceId || !bundle) return null;
    const source = bundle.sources.find((item) => item.id === jobDetailSourceId);
    return source?.latest_job_id ?? source?.active_job_id ?? null;
  }, [jobDetailSourceId, bundle?.sources]);

  useEffect(() => {
    if (!jobDetailSourceId) {
      setJobDetailSnapshot(null);
      setJobDetailError(null);
      return;
    }

    const source = bundleRef.current?.sources.find((item) => item.id === jobDetailSourceId);
    if (!source) return;

    const jobId = source.latest_job_id ?? source.active_job_id ?? null;
    if (!jobId) {
      setJobDetailSnapshot(null);
      setJobDetailError(t('crawl.jobs.detail.noJob'));
      return;
    }

    setJobDetailLoading(true);
    setJobDetailError(null);
    setJobDetailSnapshot(null);

    void fetchCrawlJobDetail(jobId, source)
      .then((job) => {
        setJobDetailSnapshot(job);
      })
      .catch((err) => {
        setJobDetailError(resolveAppErrorMessage(err, t, 'crawl.error.loadFailed'));
      })
      .finally(() => {
        setJobDetailLoading(false);
      });
  }, [jobDetailSourceId, jobDetailJobId, t]);

  useEffect(() => {
    if (!jobDetailSourceId || !jobDetailJobId || !bundle) return;

    const source = bundle.sources.find((item) => item.id === jobDetailSourceId);
    if (!source || !isPipelineInFlight(source.pipeline_status)) return;

    let cancelled = false;

    const intervalId = setInterval(() => {
      if (cancelled) return;
      const latestSource = bundleRef.current?.sources.find((item) => item.id === jobDetailSourceId);
      const latestJobId = latestSource?.latest_job_id ?? latestSource?.active_job_id ?? null;
      if (!latestSource || !latestJobId || !isPipelineInFlight(latestSource.pipeline_status)) {
        return;
      }

      void fetchCrawlJobDetail(latestJobId, latestSource)
        .then((job) => {
          if (!cancelled) setJobDetailSnapshot(job);
        })
        .catch(() => {});
    }, CRAWL_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [jobDetailSourceId, jobDetailJobId, bundle?.sources]);

  const handleRunSource = useCallback(
    async (sourceId: string) => {
      const source = bundle?.sources.find((item) => item.id === sourceId);
      if (source && !canStartCrawlForSite(source)) {
        notify(t('crawl.toast.crawlAlreadyRunning.description'), 'error');
        return;
      }
      setSaving(true);
      setFeedback(null);
      try {
        const outcome = await runCrawlOnSource(sourceId);
        setBundle(outcome.bundle);
        if (outcome.enqueueStatus === 'waiting') {
          notify(t('crawl.toast.crawlQueued.description'));
        } else {
          notify(t('crawl.toast.crawlStartedShort'));
        }
        setDomainSubTab('jobs');
      } catch (err) {
        const axiosError = err as AxiosError<{ detail?: string }>;
        if (axiosError?.response?.status === 409) {
          notify(t('crawl.toast.crawlAlreadyRunning.description'), 'error');
        } else {
          setFeedback({
            type: 'error',
            message: resolveAppErrorMessage(err, t, 'common.saveFailed'),
          });
        }
      } finally {
        setSaving(false);
      }
    },
    [bundle?.sources, notify]
  );

  const handleToggleSource = useCallback(
    async (sourceId: string) => {
      await runSave(
        () => toggleSourceActive(sourceId, bundleRef.current?.documents ?? []),
        t('crawl.toast.sourceUpdated'),
        false,
      );
    },
    [runSave]
  );

  const handleDeleteSource = useCallback(
    async (sourceId: string) => {
      await runSave(
        () => deleteCrawlSource(sourceId, bundleRef.current?.documents ?? []),
        t('crawl.toast.sourceDeleted'),
        true,
        { refreshCoverageInBackground: true },
      );
    },
    [runSave, t]
  );

  const handleDeleteDocument = useCallback(
    async (documentId: string) => {
      await runSave(
        () => deleteDocument(documentId),
        t('documents.toast.deleted.description'),
        true,
        { refreshCoverageInBackground: true },
      );
      setSelectedDocumentIds((current) => current.filter((id) => id !== documentId));
    },
    [runSave, t]
  );

  const handleBulkReindexDocuments = useCallback(
    async (documentIds: string[]) => {
      await beginReindex(documentIds);
    },
    [beginReindex]
  );

  const handleBulkDeleteDocuments = useCallback(
    async (documentIds: string[]) => {
      if (documentIds.length === 0) return;
      const ok = await runSave(
        () => bulkDeleteDocuments(documentIds),
        documentIds.length === 1
          ? t('documents.toast.bulkDeletedCountOne')
          : t('documents.toast.bulkDeletedCountMany', { count: documentIds.length }),
        true,
        { refreshCoverageInBackground: true },
      );
      if (ok) {
        setSelectedDocumentIds([]);
        setActiveSheet(null);
      }
    },
    [runSave, t]
  );

  const handleReindexDocument = useCallback(
    async (documentId: string) => {
      await beginReindex([documentId]);
    },
    [beginReindex]
  );

  const handleViewDocument = useCallback((documentId: string) => {
    setActiveSheet({ type: 'document-detail', documentId });
    setActionMenu(null);
  }, []);

  const handleInspectDocument = useCallback((documentId: string) => {
    setActiveSheet({ type: 'document-inspector', documentId });
    setActionMenu(null);
  }, []);

  const handleEditDocument = useCallback((documentId: string) => {
    setActiveSheet({ type: 'edit-document', documentId });
    setActionMenu(null);
  }, []);

  const handleOpenDocument = useCallback(
    async (documentId: string) => {
      const doc = bundle?.documents.find((item) => item.id === documentId);
      if (!doc) return;
      const opened = await openDocumentPreview(doc);
      if (opened) {
        notify(t('documents.toast.opened', { title: doc.title ?? doc.name }));
      } else {
        notify(t('documents.previewUnavailable'), 'error');
      }
    },
    [bundle?.documents, notify]
  );

  const toggleDocumentSelection = useCallback((id: string) => {
    setSelectedDocumentIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  const selectAllDocuments = useCallback((documentIds: string[]) => {
    setSelectedDocumentIds(documentIds);
  }, []);

  const toggleSelectAllFilteredDocuments = useCallback((documentIds: string[]) => {
    if (documentIds.length === 0) return;
    setSelectedDocumentIds((current) => {
      const allSelected = documentIds.every((id) => current.includes(id));
      if (allSelected) return current.filter((id) => !documentIds.includes(id));
      return Array.from(new Set([...current, ...documentIds]));
    });
  }, []);

  const clearDocumentSelection = useCallback(() => {
    setSelectedDocumentIds([]);
  }, []);

  useEffect(() => {
    setSelectedDocumentIds((current) => {
      const uploadIds = new Set(
        (bundle?.documents ?? []).filter((doc) => !isGmailDocument(doc)).map((doc) => doc.id)
      );
      const next = current.filter((id) => uploadIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [bundle?.documents]);

  const toggleGmailStagedSelection = useCallback((id: string) => {
    setGmailAllInboxSelected(false);
    setGmailStagedSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }, []);

  const selectVisibleGmailInbox = useCallback(() => {
    const ids = (gmail?.inbox.items ?? []).map((item) => item.id);
    setGmailStagedSelected(ids);
    setGmailAllInboxSelected(false);
  }, [gmail?.inbox.items]);

  const selectAllGmailInbox = useCallback(() => {
    setGmailAllInboxSelected(true);
    setGmailStagedSelected([]);
  }, []);

  const clearGmailSelection = useCallback(() => {
    setGmailStagedSelected([]);
    setGmailAllInboxSelected(false);
  }, []);

  const refreshTab = useCallback(async () => {
    const tab = primaryTabRef.current;
    await load('refresh');
    if (tab === 'gmail') {
      await loadGmail();
      notify(t('crawl.toast.gmailRefreshed'));
      return;
    }
    if (tab === 'document') {
      notify(t('crawl.toast.refreshed.documentDescription'));
      return;
    }
    notify(t('crawl.toast.refreshed.domainDescription'));
  }, [load, loadGmail, notify, t]);

  const value = useMemo<CrawlContextValue>(
    () => ({
      bundle,
      gmail,
      gmailLoading,
      gmailInboxLoadingMore,
      embeddingCoverage,
      embeddingTargetOptions,
      reindexProgress,
      reindexPollMask,
      reindexPollSnapshot,
      reindexingDocuments,
      documentUploadProgress,
      isUploadingDocuments,
      loading,
      refreshing,
      saving,
      jobDetailLoading,
      jobDetailSnapshot,
      jobDetailError,
      error,
      feedback,
      primaryTab,
      domainSubTab,
      sourceFilters,
      jobFilters,
      documentFilters,
      documentView,
      selectedDocumentIds,
      gmailStagedSelected,
      gmailAllInboxSelected,
      activeSheet,
      actionMenu,
      setPrimaryTab,
      setDomainSubTab,
      setSourceFilters,
      setJobFilters,
      setDocumentFilters,
      setDocumentView,
      toggleDocumentSelection,
      selectAllDocuments,
      toggleSelectAllFilteredDocuments,
      clearDocumentSelection,
      toggleGmailStagedSelection,
      selectVisibleGmailInbox,
      selectAllGmailInbox,
      clearGmailSelection,
      openSheet: setActiveSheet,
      closeSheet: () => setActiveSheet(null),
      openActionMenu: setActionMenu,
      closeActionMenu: () => setActionMenu(null),
      refresh: refreshTab,
      refreshGmail: loadGmail,
      loadMoreGmailInbox,
      clearFeedback: () => setFeedback(null),
      notify,
      handleSubmitSource,
      handleUploadDocument,
      handleUpdateDocument,
      handleReindexDocument,
      handleOpenDocument,
      handleSaveGmail,
      handleConnectGmail,
      handleSyncGmail,
      handlePauseGmail,
      handleResumeGmail,
      handleDisconnectGmail,
      handleIndexGmailInbox,
      handleDismissGmailInbox,
      handleRefreshJob,
      handleRunSource,
      handleToggleSource,
      handleDeleteSource,
      handleDeleteDocument,
      handleBulkReindexDocuments,
      handleBulkDeleteDocuments,
      handleViewDocument,
      handleInspectDocument,
      handleEditDocument,
    }),
    [
      bundle,
      gmail,
      gmailLoading,
      gmailInboxLoadingMore,
      embeddingCoverage,
      embeddingTargetOptions,
      reindexProgress,
      reindexPollMask,
      reindexPollSnapshot,
      reindexingDocuments,
      documentUploadProgress,
      isUploadingDocuments,
      loading,
      refreshing,
      saving,
      jobDetailLoading,
      jobDetailSnapshot,
      jobDetailError,
      error,
      feedback,
      primaryTab,
      domainSubTab,
      sourceFilters,
      jobFilters,
      documentFilters,
      documentView,
      selectedDocumentIds,
      gmailStagedSelected,
      gmailAllInboxSelected,
      activeSheet,
      actionMenu,
      toggleDocumentSelection,
      selectAllDocuments,
      toggleSelectAllFilteredDocuments,
      clearDocumentSelection,
      toggleGmailStagedSelection,
      selectVisibleGmailInbox,
      selectAllGmailInbox,
      clearGmailSelection,
      load,
      loadGmail,
      loadMoreGmailInbox,
      refreshTab,
      notify,
      handleSubmitSource,
      handleUploadDocument,
      handleUpdateDocument,
      handleReindexDocument,
      handleOpenDocument,
      handleSaveGmail,
      handleConnectGmail,
      handleSyncGmail,
      handlePauseGmail,
      handleResumeGmail,
      handleDisconnectGmail,
      handleIndexGmailInbox,
      handleDismissGmailInbox,
      handleRefreshJob,
      handleRunSource,
      handleToggleSource,
      handleDeleteSource,
      handleDeleteDocument,
      handleBulkReindexDocuments,
      handleBulkDeleteDocuments,
      handleViewDocument,
      handleInspectDocument,
      handleEditDocument,
    ]
  );

  return <CrawlContext.Provider value={value}>{children}</CrawlContext.Provider>;
}

export function useCrawlManagement() {
  const context = useContext(CrawlContext);
  if (!context) {
    throw new Error('useCrawlManagement must be used within CrawlProvider');
  }
  return context;
}
