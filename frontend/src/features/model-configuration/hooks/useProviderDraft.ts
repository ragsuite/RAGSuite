import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  ProviderCatalogEntry,
  ProviderDraft,
  SurfaceTuningDraft,
  TuningSurface,
} from '@/features/model-configuration/types/model-configuration.types';
import { buildProviderDraft } from '@/features/model-configuration/utils/model-configuration.mappers';
import { isOllamaProvider } from '@/features/search-config/utils/search-model-settings';
import {
  formatApiKeyFieldDisplay,
  isMaskedApiKey,
  resolveApiKeyFieldValue,
} from '@/features/search-config/utils/search-settings-api';

/**
 * Form state for one provider tab. A saved key is shown masked; focusing the
 * field clears it for replacement and blurring without typing re-masks it.
 */
export function useProviderDraft(entry: ProviderCatalogEntry) {
  const [draft, setDraft] = useState<ProviderDraft>(() => buildProviderDraft(entry));
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const pendingKeyRef = useRef('');
  const configSnapshot = JSON.stringify(entry.config);

  const reset = useCallback(() => {
    pendingKeyRef.current = '';
    setApiKeyEditing(false);
    setDraft(buildProviderDraft(entry));
  }, [entry]);

  useEffect(() => {
    reset();
    // Re-seed only when the saved config for this provider changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.key, configSnapshot]);

  const isOllama = isOllamaProvider(entry.key);
  const hasSavedApiKey = entry.config.hasApiKey;
  const savedDisplay = hasSavedApiKey ? formatApiKeyFieldDisplay(entry.config.apiKeyMasked) : '';

  const setField = useCallback(<K extends keyof ProviderDraft>(key: K, value: ProviderDraft[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setSurfacePatch = useCallback((surface: TuningSurface, patch: Partial<SurfaceTuningDraft>) => {
    setDraft((prev) => ({
      ...prev,
      surfaces: { ...prev.surfaces, [surface]: { ...prev.surfaces[surface], ...patch } },
    }));
  }, []);

  const remaskApiKey = useCallback(() => {
    setApiKeyEditing(false);
    if (!savedDisplay) return;
    pendingKeyRef.current = '';
    setDraft((prev) => ({ ...prev, apiKey: savedDisplay }));
  }, [savedDisplay]);

  const onApiKeyFocus = useCallback(() => {
    if (isOllama) return;
    setApiKeyEditing(true);
    if (hasSavedApiKey && isMaskedApiKey(draft.apiKey)) {
      pendingKeyRef.current = '';
      setDraft((prev) => ({ ...prev, apiKey: '' }));
    }
  }, [isOllama, hasSavedApiKey, draft.apiKey]);

  const onApiKeyBlur = useCallback(() => {
    if (isOllama) return;
    if (hasSavedApiKey && !pendingKeyRef.current) {
      remaskApiKey();
      return;
    }
    setApiKeyEditing(false);
  }, [isOllama, hasSavedApiKey, remaskApiKey]);

  const onApiKeyChange = useCallback((value: string) => {
    setApiKeyEditing(true);
    const next = isMaskedApiKey(value) ? '' : value;
    pendingKeyRef.current = next.trim();
    setDraft((prev) => ({ ...prev, apiKey: next }));
  }, []);

  const apiKeyFieldValue = useMemo(
    () =>
      resolveApiKeyFieldValue({
        draftApiKey: draft.apiKey,
        providerApiKeys: null,
        provider: entry.key,
        apiKeyMasked: entry.config.apiKeyMasked,
        hasSavedApiKey,
        isEditing: apiKeyEditing || Boolean(pendingKeyRef.current),
        isOllama,
      }),
    [draft.apiKey, entry.key, entry.config.apiKeyMasked, hasSavedApiKey, apiKeyEditing, isOllama],
  );

  return {
    draft,
    setField,
    setSurfacePatch,
    reset,
    isOllama,
    hasSavedApiKey,
    savedKeyRejected: hasSavedApiKey && entry.config.keyRejected,
    apiKeyEditing,
    apiKeyFieldValue,
    pendingKey: pendingKeyRef.current,
    getPendingKey: () => pendingKeyRef.current,
    showingSavedMask: hasSavedApiKey && !apiKeyEditing && isMaskedApiKey(draft.apiKey),
    onApiKeyFocus,
    onApiKeyBlur,
    onApiKeyChange,
    remaskApiKey,
  };
}

export type ProviderDraftController = ReturnType<typeof useProviderDraft>;
