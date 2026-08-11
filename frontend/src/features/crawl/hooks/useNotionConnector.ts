import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import type {
  NotionConnectInput,
  NotionCredentialStatus,
  NotionIntegration,
  NotionSourcesSelection,
  NotionSyncJob,
} from '@/features/crawl/types/notion.types';
import {
  handleDisconnectNotion,
  handleGetNotionAuthUrl,
  handleGetNotionCredentialStatus,
  handleGetNotionJobs,
  handleGetNotionStatus,
  handlePauseNotion,
  handleResumeNotion,
  handleSaveNotionSettings,
  handleSaveNotionSources,
  handleTriggerNotionSync,
  handleUpsertNotionCredentials,
} from '@/network/actions/notion.actions';
import { getNotionOAuthRedirectUri } from '@/features/crawl/utils/notion-oauth';

WebBrowser.maybeCompleteAuthSession();

const POLL_INTERVAL_MS = 5000;
const STALE_JOB_MS = 10 * 60 * 1000;

async function openConnectorAuth(authUrl: string, redirectUri: string, windowName: string): Promise<void> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const w = 520;
    const h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    window.open(authUrl, windowName, `width=${w},height=${h},left=${left},top=${top}`);
    return;
  }
  await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
}

export function useNotionConnector(projectId: string) {
  const [status, setStatus] = useState<NotionIntegration | null>(null);
  const [credentials, setCredentials] = useState<NotionCredentialStatus | null>(null);
  const [jobs, setJobs] = useState<NotionSyncJob[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isLoadingCredentials, setIsLoadingCredentials] = useState(false);
  const [isLoadingJobs, setIsLoadingJobs] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSavingSources, setIsSavingSources] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const latestJob = jobs[0];
  const latestJobActive = latestJob?.status === 'PENDING' || latestJob?.status === 'RUNNING';
  const latestJobIsStale = useMemo(() => {
    if (!latestJob || !latestJobActive) return false;
    const queuedAt = new Date(latestJob.queued_at).getTime();
    return Number.isFinite(queuedAt) && Date.now() - queuedAt > STALE_JOB_MS;
  }, [latestJob, latestJobActive]);
  const hasRunningJob = latestJobActive && !latestJobIsStale;

  const loadStatus = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingStatus(true);
    try {
      const next = await handleGetNotionStatus(projectId);
      setStatus(next);
      return next;
    } finally {
      setIsLoadingStatus(false);
    }
  }, [projectId]);

  const loadCredentials = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingCredentials(true);
    try {
      const next = await handleGetNotionCredentialStatus(projectId);
      setCredentials(next);
      return next;
    } finally {
      setIsLoadingCredentials(false);
    }
  }, [projectId]);

  const loadJobs = useCallback(async () => {
    if (!projectId) return;
    setIsLoadingJobs(true);
    try {
      const next = await handleGetNotionJobs(projectId);
      setJobs(next);
      return next;
    } finally {
      setIsLoadingJobs(false);
    }
  }, [projectId]);

  const refetch = useCallback(async () => {
    await Promise.all([loadStatus(), loadCredentials(), status ? loadJobs() : Promise.resolve()]);
  }, [loadCredentials, loadJobs, loadStatus, status]);

  const refetchAll = useCallback(async () => {
    const nextStatus = await loadStatus();
    await loadCredentials();
    if (nextStatus) {
      await loadJobs();
    } else {
      setJobs([]);
    }
  }, [loadCredentials, loadJobs, loadStatus]);

  useEffect(() => {
    void refetchAll();
  }, [refetchAll]);

  useEffect(() => {
    if (!projectId || !status) {
      setJobs([]);
      return;
    }
    void loadJobs();
  }, [loadJobs, projectId, status]);

  const onOAuthMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'connector_connected' && event.data?.connector === 'notion') {
        void refetchAll();
      }
    },
    [refetchAll],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.addEventListener('message', onOAuthMessage);
    return () => window.removeEventListener('message', onOAuthMessage);
  }, [onOAuthMessage]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!hasRunningJob || !projectId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollRef.current = setInterval(() => {
      void loadJobs();
      void loadStatus();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [hasRunningJob, loadJobs, loadStatus, projectId]);

  const connect = useCallback(
    async (payload: NotionConnectInput) => {
      if (!projectId) return;
      setIsConnecting(true);
      try {
        if (payload.save_credentials) {
          await handleUpsertNotionCredentials({
            project_id: projectId,
            client_id: payload.client_id,
            client_secret: payload.client_secret,
            redirect_uri: payload.redirect_uri,
          });
          await loadCredentials();
        }
        const authUrl = await handleGetNotionAuthUrl(projectId);
        await openConnectorAuth(authUrl, payload.redirect_uri || getNotionOAuthRedirectUri(), 'notion-oauth');
        if (Platform.OS !== 'web') {
          await refetchAll();
        }
      } finally {
        setIsConnecting(false);
      }
    },
    [loadCredentials, projectId, refetchAll],
  );

  const saveSources = useCallback(
    async (selection: NotionSourcesSelection) => {
      if (!projectId) throw new Error('errors.projectRequired');
      setIsSavingSources(true);
      try {
        const next = await handleSaveNotionSources(projectId, selection);
        setStatus(next);
        return next;
      } finally {
        setIsSavingSources(false);
      }
    },
    [projectId],
  );

  const saveSettings = useCallback(
    async (settings: NotionIntegration['settings']) => {
      if (!projectId) throw new Error('errors.projectRequired');
      setIsSavingSettings(true);
      try {
        const next = await handleSaveNotionSettings(projectId, settings);
        setStatus(next);
        return next;
      } finally {
        setIsSavingSettings(false);
      }
    },
    [projectId],
  );

  const triggerSync = useCallback(async () => {
    if (!projectId) return;
    setIsSyncing(true);
    try {
      await handleTriggerNotionSync(projectId);
      await Promise.all([loadStatus(), loadJobs()]);
    } finally {
      setIsSyncing(false);
    }
  }, [loadJobs, loadStatus, projectId]);

  const pause = useCallback(async () => {
    if (!projectId) return;
    setActionPending(true);
    try {
      const next = await handlePauseNotion(projectId);
      setStatus(next);
    } finally {
      setActionPending(false);
    }
  }, [projectId]);

  const resume = useCallback(async () => {
    if (!projectId) return;
    setActionPending(true);
    try {
      const next = await handleResumeNotion(projectId);
      setStatus(next);
    } finally {
      setActionPending(false);
    }
  }, [projectId]);

  const disconnect = useCallback(async () => {
    if (!projectId) return;
    setIsDisconnecting(true);
    try {
      await handleDisconnectNotion(projectId);
      setStatus(null);
      setJobs([]);
    } finally {
      setIsDisconnecting(false);
    }
  }, [projectId]);

  return {
    status,
    credentials,
    jobs,
    latestJob,
    hasRunningJob,
    latestJobIsStale,
    isConnected: Boolean(status),
    isLoadingStatus,
    isLoadingCredentials,
    isLoadingJobs,
    isConnecting,
    isSavingSources,
    isSavingSettings,
    isSyncing,
    isDisconnecting,
    actionPending,
    connect,
    saveSources,
    saveSettings,
    triggerSync,
    pause,
    resume,
    disconnect,
    refetch,
    refetchAll,
  };
}
