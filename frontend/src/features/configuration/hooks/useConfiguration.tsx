import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import {
  createApiKey,
  deleteApiKey,
  fetchApiKeys,
  fetchN8nInboundTemplate,
  revealApiKey,
  testN8nRetrieve,
  testRetrieval,
  type N8nInboundTemplate,
} from '@/features/configuration/services/configuration.service';
import type {
  ApiKey,
  ConfigurationFeedback,
  ConfigurationPrimaryTab,
  ConfigurationSheet,
  CreateApiKeyPayload,
  CurlCommandVariant,
} from '@/features/configuration/types/configuration.types';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';

type ConfigurationContextValue = {
  apiKeys: ApiKey[];
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  testing: boolean;
  revealingKeyId: string | null;
  error: string | null;
  feedback: ConfigurationFeedback;
  primaryTab: ConfigurationPrimaryTab;
  activeSheet: ConfigurationSheet;
  revealedKeyIds: Set<string>;
  revealedSecrets: Record<string, string>;
  curlVariant: CurlCommandVariant;
  n8nSelectedKeyId: string | null;
  n8nPastedKey: string;
  n8nTemplate: N8nInboundTemplate | null;
  n8nTemplateLoading: boolean;
  activeProjectId: string | null;
  setPrimaryTab: (tab: ConfigurationPrimaryTab) => void;
  setCurlVariant: (variant: CurlCommandVariant) => void;
  setN8nSelectedKeyId: (id: string | null) => void;
  setN8nPastedKey: (value: string) => void;
  toggleRevealKey: (id: string) => Promise<void>;
  openSheet: (sheet: ConfigurationSheet) => void;
  closeSheet: () => void;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  clearFeedback: () => void;
  notify: (message: string, type?: 'success' | 'error') => void;
  handleCreateApiKey: (payload: CreateApiKeyPayload) => Promise<void>;
  handleDeleteApiKey: (id: string) => Promise<void>;
  handleTestRetrieval: () => Promise<void>;
  loadN8nKeySecret: (keyId: string) => Promise<void>;
  deletingKey: ApiKey | null;
  createdKey: ApiKey | null;
  createdFullKey: string | null;
  effectiveN8nApiKey: string;
};

const ConfigurationContext = createContext<ConfigurationContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function ConfigurationProvider({ children }: Props) {
  const { t } = useTranslation();
  const { isReady } = useAuthenticatedBootstrap();
  const { activeProjectId } = useActiveProject();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [revealingKeyId, setRevealingKeyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ConfigurationFeedback>(null);
  const [primaryTab, setPrimaryTab] = useState<ConfigurationPrimaryTab>('api-keys');
  const [activeSheet, setActiveSheet] = useState<ConfigurationSheet>(null);
  const [revealedKeyIds, setRevealedKeyIds] = useState<Set<string>>(new Set());
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [curlVariant, setCurlVariant] = useState<CurlCommandVariant>('retrieve');
  const [n8nSelectedKeyId, setN8nSelectedKeyId] = useState<string | null>(null);
  const [n8nPastedKey, setN8nPastedKey] = useState('');
  const [n8nTemplate, setN8nTemplate] = useState<N8nInboundTemplate | null>(null);
  const [n8nTemplateLoading, setN8nTemplateLoading] = useState(false);
  const saveLockRef = useRef(false);
  const successFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSuccessFeedbackRef = useRef<{ message: string; at: number } | null>(null);

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

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const keys = await fetchApiKeys(activeProjectId);
        setApiKeys(keys);
        setN8nSelectedKeyId((current) => {
          if (current && keys.some((key) => key.id === current)) return current;
          return keys[0]?.id ?? null;
        });
      } catch {
        setError(t('api-keys.toast.loadFailed.description'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeProjectId, t],
  );

  const loadN8nTemplate = useCallback(async () => {
    if (!activeProjectId) {
      setN8nTemplate(null);
      return;
    }
    setN8nTemplateLoading(true);
    try {
      const template = await fetchN8nInboundTemplate(activeProjectId);
      setN8nTemplate(template);
    } catch {
      setN8nTemplate(null);
    } finally {
      setN8nTemplateLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => {
    if (!isReady) return;
    void load('initial');
  }, [isReady, load]);

  useEffect(() => {
    if (!isReady || primaryTab !== 'n8n') return;
    void loadN8nTemplate();
    void load('refresh');
  }, [isReady, primaryTab, loadN8nTemplate, load]);

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

  const refresh = useCallback(() => load('refresh'), [load]);
  const reload = useCallback(() => load('initial'), [load]);

  const openSheet = useCallback((sheet: ConfigurationSheet) => {
    setActiveSheet(sheet);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const cacheRevealedSecret = useCallback((id: string, secret: string) => {
    setRevealedSecrets((current) => ({ ...current, [id]: secret }));
    setApiKeys((current) =>
      current.map((key) => (key.id === id ? { ...key, secretKey: secret } : key)),
    );
  }, []);

  const loadN8nKeySecret = useCallback(
    async (keyId: string) => {
      const existing = apiKeys.find((key) => key.id === keyId);
      if (existing?.secretKey) {
        setN8nPastedKey(existing.secretKey);
        return;
      }
      if (revealedSecrets[keyId]) {
        setN8nPastedKey(revealedSecrets[keyId]);
        return;
      }
      try {
        const secret = await revealApiKey(keyId);
        cacheRevealedSecret(keyId, secret);
        setN8nPastedKey(secret);
      } catch {
        notify(t('api-keys.toast.revealFailed.description'), 'error');
      }
    },
    [apiKeys, cacheRevealedSecret, notify, revealedSecrets],
  );

  const toggleRevealKey = useCallback(
    async (id: string) => {
      if (revealedKeyIds.has(id)) {
        setRevealedKeyIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        return;
      }

      const key = apiKeys.find((item) => item.id === id);
      if (!key) return;

      if (key.secretKey || revealedSecrets[id]) {
        setRevealedKeyIds((current) => new Set(current).add(id));
        return;
      }

      setRevealingKeyId(id);
      try {
        const secret = await revealApiKey(id);
        cacheRevealedSecret(id, secret);
        setRevealedKeyIds((current) => new Set(current).add(id));
      } catch {
        notify(t('api-keys.toast.revealFailed.description'), 'error');
      } finally {
        setRevealingKeyId(null);
      }
    },
    [apiKeys, cacheRevealedSecret, notify, revealedKeyIds, revealedSecrets],
  );

  const handleCreateApiKey = useCallback(
    async (payload: CreateApiKeyPayload) => {
      if (saveLockRef.current) return;
      saveLockRef.current = true;
      setSaving(true);
      setFeedback(null);
      try {
        const result = await createApiKey(payload);
        cacheRevealedSecret(result.key.id, result.fullKey);
        setApiKeys((current) => [result.key, ...current]);
        setN8nSelectedKeyId(result.key.id);
        setActiveSheet({ type: 'created', keyId: result.key.id, fullKey: result.fullKey });
        notify(t('api-keys.dialog.title'));
      } catch (err) {
        setFeedback({
          type: 'error',
          message: resolveAppErrorMessage(err, t, 'api-keys.toast.createFailed.description'),
        });
      } finally {
        setSaving(false);
        saveLockRef.current = false;
      }
    },
    [cacheRevealedSecret, notify, t],
  );

  const handleDeleteApiKey = useCallback(
    async (id: string) => {
      if (saveLockRef.current) return;
      saveLockRef.current = true;
      setSaving(true);
      setFeedback(null);
      try {
        await deleteApiKey(id);
        setApiKeys((current) => {
          const remaining = current.filter((key) => key.id !== id);
          setN8nSelectedKeyId((selectedId) => {
            if (remaining.length === 0) return null;
            if (selectedId === id) return remaining[0]?.id ?? null;
            return selectedId;
          });
          return remaining;
        });
        setRevealedKeyIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setRevealedSecrets((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
        closeSheet();
        notify(t('api-keys.toast.revoked.title'));
      } catch (err) {
        setFeedback({
          type: 'error',
          message: resolveAppErrorMessage(err, t, 'api-keys.toast.revokeFailed.description'),
        });
      } finally {
        setSaving(false);
        saveLockRef.current = false;
      }
    },
    [closeSheet, notify, t],
  );

  const handleTestRetrieval = useCallback(async () => {
    if (!activeProjectId) {
      notify(t('compareModels.empty.noProject'), 'error');
      return;
    }

    const pasted = n8nPastedKey.trim();
    if (!pasted) {
      notify(t('models.apiKey.test.noKey'), 'error');
      return;
    }

    setTesting(true);
    try {
      const result = activeProjectId
        ? await testN8nRetrieve(activeProjectId)
        : await testRetrieval(pasted);
      if (result.success) {
        notify(result.message);
        await load('refresh');
      } else {
        notify(result.message, 'error');
      }
    } catch {
      try {
        const fallback = await testRetrieval(pasted);
        if (fallback.success) {
          notify(fallback.message);
          await load('refresh');
          return;
        }
        notify(fallback.message, 'error');
      } catch {
        notify(t('errors.server.description'), 'error');
      }
    } finally {
      setTesting(false);
    }
  }, [activeProjectId, load, n8nPastedKey, notify, t]);

  const deletingKey = useMemo(() => {
    if (activeSheet?.type !== 'confirm-delete') return null;
    return apiKeys.find((key) => key.id === activeSheet.keyId) ?? null;
  }, [activeSheet, apiKeys]);

  const createdKey = useMemo(() => {
    if (activeSheet?.type !== 'created') return null;
    return apiKeys.find((key) => key.id === activeSheet.keyId) ?? null;
  }, [activeSheet, apiKeys]);

  const createdFullKey = useMemo(() => {
    if (activeSheet?.type !== 'created') return null;
    return activeSheet.fullKey;
  }, [activeSheet]);

  const effectiveN8nApiKey = useMemo(() => {
    if (n8nPastedKey.trim()) return n8nPastedKey.trim();
    const selected = apiKeys.find((key) => key.id === n8nSelectedKeyId);
    if (selected?.secretKey) return selected.secretKey;
    if (selected && revealedSecrets[selected.id]) return revealedSecrets[selected.id];
    return 'Your_API_key';
  }, [apiKeys, n8nPastedKey, n8nSelectedKeyId, revealedSecrets]);

  const value = useMemo<ConfigurationContextValue>(
    () => ({
      apiKeys,
      loading,
      refreshing,
      saving,
      testing,
      revealingKeyId,
      error,
      feedback,
      primaryTab,
      activeSheet,
      revealedKeyIds,
      revealedSecrets,
      curlVariant,
      n8nSelectedKeyId,
      n8nPastedKey,
      n8nTemplate,
      n8nTemplateLoading,
      activeProjectId,
      setPrimaryTab,
      setCurlVariant,
      setN8nSelectedKeyId,
      setN8nPastedKey,
      toggleRevealKey,
      openSheet,
      closeSheet,
      refresh,
      reload,
      clearFeedback,
      notify,
      handleCreateApiKey,
      handleDeleteApiKey,
      handleTestRetrieval,
      loadN8nKeySecret,
      deletingKey,
      createdKey,
      createdFullKey,
      effectiveN8nApiKey,
    }),
    [
      apiKeys,
      loading,
      refreshing,
      saving,
      testing,
      revealingKeyId,
      error,
      feedback,
      primaryTab,
      activeSheet,
      revealedKeyIds,
      revealedSecrets,
      curlVariant,
      n8nSelectedKeyId,
      n8nPastedKey,
      n8nTemplate,
      n8nTemplateLoading,
      activeProjectId,
      openSheet,
      closeSheet,
      refresh,
      reload,
      clearFeedback,
      notify,
      handleCreateApiKey,
      handleDeleteApiKey,
      handleTestRetrieval,
      loadN8nKeySecret,
      deletingKey,
      createdKey,
      createdFullKey,
      effectiveN8nApiKey,
      toggleRevealKey,
    ],
  );

  return <ConfigurationContext.Provider value={value}>{children}</ConfigurationContext.Provider>;
}

export function useConfiguration() {
  const context = useContext(ConfigurationContext);
  if (!context) {
    throw new Error('useConfiguration must be used within ConfigurationProvider');
  }
  return context;
}
