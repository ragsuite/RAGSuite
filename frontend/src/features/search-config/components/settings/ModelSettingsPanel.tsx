import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SearchEmbeddingReindexBanner } from '@/features/search-config/components/settings/SearchEmbeddingReindexBanner';
import { SearchModelApiKeyConnectionHint } from '@/features/search-config/components/settings/SearchModelApiKeyConnectionHint';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { ModelProvider, ModelSettings } from '@/features/search-config/types/search-config.types';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import {
  getChatModelsForProvider,
  normalizeModelProviderKey,
  paramFieldLabel,
  resolveChatModelsForProvider,
  resolveEmbeddingModelOptions,
  resolveProviderOptions,
} from '@/features/search-config/utils/model-settings-options';
import {
  hasUsableSavedApiKeyForProvider,
  isOllamaPlaceholderKey,
  isOllamaProvider,
  resolveApiKeyForPersist,
  resolveOllamaApiKeyDraft,
  validateMaxTokensForResponseType,
} from '@/features/search-config/utils/search-model-settings';
import {
  buildSavedApiKeyFieldDisplay,
  formatApiKeyFieldDisplay,
  isMaskedApiKey,
  lookupProviderApiKeyMask,
  resolveApiKeyFieldValue,
} from '@/features/search-config/utils/search-settings-api';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { Cpu } from 'lucide-react-native';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';
import { LlmEgressWarningBanner } from '@/shared/components/compliance/LlmEgressWarningBanner';

function FieldHint({ children }: { children: string }) {
  const { colors, typography, surfaceRadius } = useAppTheme();
  return <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{children}</Text>;
}

function SectionDivider() {
  const { colors, spacing, surfaceRadius } = useAppTheme();
  return (
    <View
      style={[styles.divider, { borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md }]}
    />
  );
}

function numField(
  label: string,
  hint: string,
  value: number,
  onChange: (n: number) => void,
  keyboardType: 'decimal-pad' | 'number-pad' = 'decimal-pad',
) {
  return (
    <View style={{ gap: 4 }}>
      <AppTextField
        label={label}
        value={String(value)}
        keyboardType={keyboardType}
        onChangeText={(text) => {
          const n = keyboardType === 'number-pad' ? Number.parseInt(text, 10) : Number.parseFloat(text);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
      <FieldHint>{hint}</FieldHint>
    </View>
  );
}

function buildDraftFromBundle(settings: ModelSettings): ModelSettings {
  const provider = normalizeModelProviderKey(settings.provider);
  const mask =
    lookupProviderApiKeyMask(settings.providerApiKeys, provider) ||
    settings.apiKeyMasked?.trim() ||
    '';
  const draft = {
    ...settings,
    provider,
    providerApiKeys: settings.providerApiKeys ?? {},
    apiKeyMasked: mask,
    apiKey: '',
  };
  if (isOllamaProvider(provider)) {
    draft.apiKey = resolveOllamaApiKeyDraft('');
  } else if (mask) {
    draft.apiKey = formatApiKeyFieldDisplay(mask);
  }
  return draft;
}

export function ModelSettingsPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { bundle, saving, refreshing, notify, handleSaveModelSettings, handleRefreshModelStatus } =
    useSearchConfig();
  const [draft, setDraft] = useState<ModelSettings | null>(null);
  const [embeddingRefreshKey, setEmbeddingRefreshKey] = useState(0);
  const [maxTokensError, setMaxTokensError] = useState<string | null>(null);
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const hasPopulatedApiKey = useRef(false);
  const settingsSnapshotRef = useRef<string>('');
  const pendingPlaintextApiKeyRef = useRef('');

  const clearPendingApiKey = () => {
    pendingPlaintextApiKeyRef.current = '';
  };

  useEffect(() => {
    if (!bundle?.modelSettings) return;
    const snapshot = JSON.stringify(bundle.modelSettings);
    if (snapshot === settingsSnapshotRef.current && draft) return;
    settingsSnapshotRef.current = snapshot;
    hasPopulatedApiKey.current = false;
    setApiKeyEditing(false);
    clearPendingApiKey();
    setDraft(buildDraftFromBundle(bundle.modelSettings));
    setMaxTokensError(null);
  }, [bundle?.modelSettings]);

  useEffect(() => {
    if (!draft || !bundle?.modelSettings) return;
    if (hasPopulatedApiKey.current) return;
    if (isOllamaProvider(draft.provider)) {
      setDraft((prev) => (prev ? { ...prev, apiKey: resolveOllamaApiKeyDraft(prev.apiKey) } : prev));
    } else {
      const mask =
        lookupProviderApiKeyMask(draft.providerApiKeys, draft.provider) ||
        draft.apiKeyMasked?.trim() ||
        '';
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              apiKeyMasked: mask,
              apiKey: mask ? formatApiKeyFieldDisplay(mask) : '',
            }
          : prev,
      );
    }
    hasPopulatedApiKey.current = true;
  }, [bundle?.modelSettings.apiKeyMasked, draft?.provider, bundle?.modelSettings]);

  useEffect(() => {
    if (!draft) return;
    if (isOllamaProvider(draft.provider)) {
      setDraft((prev) => {
        if (!prev) return prev;
        const nextKey = resolveOllamaApiKeyDraft(prev.apiKey);
        return prev.apiKey === nextKey ? prev : { ...prev, apiKey: nextKey };
      });
    } else if (isOllamaPlaceholderKey(draft.apiKey)) {
      setDraft((prev) => (prev ? { ...prev, apiKey: '' } : prev));
    }
  }, [draft?.provider]);

  const availableModels = bundle?.availableModels;
  const providerOptions = useMemo(() => resolveProviderOptions(availableModels), [availableModels]);
  const chatModelOptions = useMemo(
    () =>
      draft
        ? resolveChatModelsForProvider(draft.provider, availableModels)
        : getChatModelsForProvider('openai'),
    [draft?.provider, availableModels],
  );
  const embeddingOptions = useMemo(
    () => (draft ? resolveEmbeddingModelOptions(draft.provider, availableModels) : []),
    [draft?.provider, availableModels],
  );

  useEffect(() => {
    if (!draft || chatModelOptions.length === 0) return;
    if (!chatModelOptions.some((m) => m.key === draft.chatModel)) {
      setDraft((prev) => (prev ? { ...prev, chatModel: chatModelOptions[0]?.key ?? prev.chatModel } : prev));
    }
  }, [draft?.provider, chatModelOptions]);

  useEffect(() => {
    if (!draft || embeddingOptions.length === 0 || !draft.embeddingModel) return;
    if (!embeddingOptions.some((m) => m.key === draft.embeddingModel)) {
      setDraft((prev) =>
        prev ? { ...prev, embeddingModel: embeddingOptions[0]?.key ?? prev.embeddingModel } : prev,
      );
    }
  }, [draft?.provider, embeddingOptions, draft?.embeddingModel]);

  const responseType = bundle?.searchResponseConfig.responseType ?? 'long';
  const maxTokensMin = responseType === 'long' ? 400 : 200;
  const hasSavedApiKey = hasUsableSavedApiKeyForProvider({
    apiKeyMasked: draft?.apiKeyMasked ?? bundle?.modelSettings.apiKeyMasked,
    savedProvider: draft?.provider ?? bundle?.modelSettings.provider,
    draftProvider: draft?.provider,
    providerApiKeys: draft?.providerApiKeys ?? bundle?.modelSettings.providerApiKeys,
  });
  const isOllama = isOllamaProvider(draft?.provider);
  const isLoading = refreshing && !bundle?.modelSettings;
  const showingSavedMask =
    !isOllama && hasSavedApiKey && !apiKeyEditing && isMaskedApiKey(draft?.apiKey ?? '');

  const apiKeyFieldValue = useMemo(() => {
    if (!draft) return '';
    return resolveApiKeyFieldValue({
      draftApiKey: draft.apiKey,
      providerApiKeys: draft.providerApiKeys,
      provider: draft.provider,
      apiKeyMasked: draft.apiKeyMasked,
      hasSavedApiKey,
      isEditing: apiKeyEditing,
      isOllama,
    });
  }, [draft, hasSavedApiKey, apiKeyEditing, isOllama]);

  const remaskSavedApiKeyField = () => {
    setApiKeyEditing(false);
    setDraft((prev) => {
      if (!prev || isOllamaProvider(prev.provider)) return prev;
      const display = buildSavedApiKeyFieldDisplay({
        providerApiKeys: prev.providerApiKeys,
        provider: prev.provider,
        apiKeyMasked: prev.apiKeyMasked,
      });
      if (!display) return prev;
      return { ...prev, apiKey: display };
    });
  };

  const onProviderChange = (provider: ModelProvider) => {
    const normalizedProvider = normalizeModelProviderKey(provider);
    setApiKeyEditing(false);
    clearPendingApiKey();
    setDraft((prev) => {
      if (!prev) return prev;
      const models = resolveChatModelsForProvider(normalizedProvider, availableModels);
      const chatModel = models.some((m) => m.key === prev.chatModel) ? prev.chatModel : models[0]?.key ?? '';
      const embeddings = resolveEmbeddingModelOptions(normalizedProvider, availableModels);
      const embeddingModel = embeddings.some((m) => m.key === prev.embeddingModel)
        ? prev.embeddingModel
        : embeddings[0]?.key ?? prev.embeddingModel;
      const mask = lookupProviderApiKeyMask(prev.providerApiKeys, normalizedProvider);
      return {
        ...prev,
        provider: normalizedProvider,
        chatModel,
        embeddingModel,
        apiKeyMasked: mask,
        apiKey: isOllamaProvider(normalizedProvider)
          ? resolveOllamaApiKeyDraft('')
          : mask
            ? formatApiKeyFieldDisplay(mask)
            : '',
      };
    });
    hasPopulatedApiKey.current = true;
  };

  const saveSettings = async () => {
    if (!draft || !bundle) return;

    const maxError = validateMaxTokensForResponseType(draft.maxTokens, responseType);
    if (maxError) {
      setMaxTokensError(maxError);
      notify(maxError, 'error');
      return;
    }
    setMaxTokensError(null);

    const { error: keyError } = resolveApiKeyForPersist({
      draftKey: draft.apiKey,
      pendingPlaintextKey: pendingPlaintextApiKeyRef.current,
      hasSavedKey: hasSavedApiKey,
      provider: draft.provider,
      apiKeyEditing,
    });
    if (keyError) {
      notify(keyError, 'error');
      return;
    }

    await handleSaveModelSettings(draft, {
      pendingPlaintextApiKey: pendingPlaintextApiKeyRef.current,
      apiKeyEditing,
    });
    setEmbeddingRefreshKey((key) => key + 1);
    hasPopulatedApiKey.current = true;
    clearPendingApiKey();
    remaskSavedApiKeyField();
  };

  const settingsForm = draft ? (
    <View style={{ gap: spacing.md }}>
      <AppSelectField
        label={t('search.models.provider.label')}
        value={draft.provider}
        options={providerOptions}
        onChange={onProviderChange}
      />
      <LlmEgressWarningBanner provider={draft.provider} />

      <View style={{ gap: 4 }}>
        <AppSelectField
          label={t('search.models.chatModel.label')}
          value={draft.chatModel}
          options={chatModelOptions.length > 0 ? chatModelOptions : [{ key: draft.chatModel, label: draft.chatModel || t('search.models.chatModel.noneAvailable') }]}
          onChange={(chatModel) => setDraft((prev) => (prev ? { ...prev, chatModel } : prev))}
        />
        <FieldHint>{t('search.models.chatModel.helper')}</FieldHint>
      </View>

      <View style={{ gap: 4 }}>
        {embeddingOptions.length > 0 ? (
          <AppSelectField
            label={t('search.models.embeddingModel.label')}
            value={draft.embeddingModel}
            options={embeddingOptions}
            onChange={(embeddingModel) => setDraft((prev) => (prev ? { ...prev, embeddingModel } : prev))}
          />
        ) : (
          <AppTextField
            label={t('search.models.embeddingModel.label')}
            value={draft.embeddingModel}
            placeholder={
              draft.provider
                ? t('search.models.embeddingModel.noneAvailable')
                : t('search.models.embeddingModel.selectProvider')
            }
            editable={false}
            onChangeText={() => undefined}
          />
        )}
        <FieldHint>
          {draft.embeddingModel
            ? t('search.models.embeddingModel.helper')
            : t('search.models.embeddingModel.noneAvailable')}
        </FieldHint>
      </View>

      <SearchEmbeddingReindexBanner
        refreshKey={`${embeddingRefreshKey}-${draft.embeddingModel}-${draft.provider}`}
        onReindexFinished={(progress) => {
          if (progress.status === 'error' || progress.failed > 0) {
            notify(
              progress.error ?? `Reindex finished with ${progress.failed} failed of ${progress.total} items.`,
              'error',
            );
          } else {
            notify(`Reindex complete: ${progress.embedded} of ${progress.total} items embedded.`);
          }
          void handleRefreshModelStatus();
        }}
      />

      <View style={{ gap: 4 }}>
        <AppTextField
          label={t('search.models.apiKey.label')}
          placeholder={
            isOllama
              ? t('search.models.apiKey.ollamaPlaceholder')
              : hasSavedApiKey
                ? t('search.models.apiKey.savedPlaceholder')
                : t('search.models.apiKey.placeholder')
          }
          value={apiKeyFieldValue}
          secureTextEntry={
            !isOllama && apiKeyEditing && Boolean(draft.apiKey.trim()) && !isMaskedApiKey(draft.apiKey)
          }
          autoCapitalize="none"
          editable={!isOllama}
          onFocus={() => {
            if (isOllama) return;
            if (hasSavedApiKey && isMaskedApiKey(draft.apiKey)) {
              setApiKeyEditing(true);
              clearPendingApiKey();
              setDraft((prev) => (prev ? { ...prev, apiKey: '' } : prev));
            } else {
              setApiKeyEditing(true);
            }
          }}
          onBlur={() => {
            if (isOllama) return;
            if (hasSavedApiKey) {
              remaskSavedApiKeyField();
              return;
            }
            setApiKeyEditing(false);
          }}
          onChangeText={(apiKey) => {
            hasPopulatedApiKey.current = true;
            setApiKeyEditing(true);
            const nextKey = isMaskedApiKey(apiKey) ? '' : apiKey;
            pendingPlaintextApiKeyRef.current = nextKey.trim();
            setDraft((prev) => (prev ? { ...prev, apiKey: nextKey } : prev));
          }}
        />
        <FieldHint>
          {isOllama
            ? t('search.models.apiKey.ollamaHelper')
            : hasSavedApiKey && showingSavedMask
              ? t('models.apiKey.replaceHelper')
              : t('search.models.apiKey.helper')}
        </FieldHint>
        <SearchModelApiKeyConnectionHint
          provider={draft.provider}
          apiKey={draft.apiKey}
          chatModel={draft.chatModel}
          embeddingModel={draft.embeddingModel}
          hasSavedApiKey={hasSavedApiKey}
          pendingPlaintextApiKey={pendingPlaintextApiKeyRef.current}
          onTestComplete={remaskSavedApiKeyField}
        />
      </View>

      <SectionDivider />

      {numField(
        paramFieldLabel(t('search.models.parameters.temperature'), 'chatgpt.openai_temperature', 'string'),
        'Controls randomness. Lower values are more focused.',
        draft.temperature,
        (temperature) => setDraft((prev) => (prev ? { ...prev, temperature } : prev)),
      )}

      {numField(
        paramFieldLabel(t('search.models.parameters.topP'), 'chatgpt.openai_top_p', 'string'),
        'Nucleus sampling threshold.',
        draft.topP,
        (topP) => setDraft((prev) => (prev ? { ...prev, topP } : prev)),
      )}

      {numField(
        paramFieldLabel(t('search.models.parameters.bestOf'), 'chatgpt.openai_best_of', 'int+'),
        'Generates multiple completions and returns the best.',
        draft.bestOf,
        (bestOf) => setDraft((prev) => (prev ? { ...prev, bestOf } : prev)),
        'number-pad',
      )}

      {numField(
        paramFieldLabel(t('search.models.parameters.frequencyPenalty'), 'chatgpt.openai_frequency_penalty', 'string'),
        'Reduces repetition of token sequences.',
        draft.frequencyPenalty,
        (frequencyPenalty) => setDraft((prev) => (prev ? { ...prev, frequencyPenalty } : prev)),
      )}

      {numField(
        paramFieldLabel(t('search.models.parameters.presencePenalty'), 'chatgpt.openai_presence_penalty', 'string'),
        'Encourages the model to talk about new topics.',
        draft.presencePenalty,
        (presencePenalty) => setDraft((prev) => (prev ? { ...prev, presencePenalty } : prev)),
      )}

      <SectionDivider />

      <View style={{ gap: 4 }}>
        <AppRangeField
          label={t('search.models.rag.topK')}
          value={draft.topKResults}
          min={1}
          max={10}
          step={1}
          formatValue={(v) => String(v)}
          onChange={(topKResults) => setDraft((prev) => (prev ? { ...prev, topKResults } : prev))}
        />
        <FieldHint>{t('search.models.rag.topKHelper')}</FieldHint>
      </View>

      <View style={{ gap: 4 }}>
        <AppRangeField
          label={t('search.models.rag.similarityThreshold')}
          value={draft.similarityThreshold}
          min={0.1}
          max={1}
          step={0.1}
          formatValue={(v) => v.toFixed(1)}
          onChange={(similarityThreshold) => setDraft((prev) => (prev ? { ...prev, similarityThreshold } : prev))}
        />
        <FieldHint>{t('search.models.rag.similarityThresholdHelper')}</FieldHint>
      </View>

      <View style={{ gap: 4 }}>
        <AppRangeField
          label={t('search.models.rag.maxTokens')}
          value={draft.maxTokens}
          min={maxTokensMin}
          max={3000}
          step={50}
          formatValue={(v) => (v === 0 ? t('search.models.rag.unlimited') : String(v))}
          onChange={(maxTokens) => {
            setDraft((prev) => (prev ? { ...prev, maxTokens } : prev));
            if (maxTokensError) {
              const validationError = validateMaxTokensForResponseType(maxTokens, responseType);
              if (!validationError) setMaxTokensError(null);
            }
          }}
        />
        <FieldHint>
          {responseType === 'long'
            ? t('search.models.rag.maxTokensHelp.long')
            : t('search.models.rag.maxTokensHelp.short')}
        </FieldHint>
        {maxTokensError ? (
          <Text style={[typography.caption, { color: colors.danger }]}>{maxTokensError}</Text>
        ) : null}
      </View>

      <AppSwitchRow
        bordered
        label={t('search.models.rag.useReranker')}
        description={t('search.models.rag.useRerankerHelper')}
        value={draft.useReranker}
        onChange={(useReranker) => setDraft((prev) => (prev ? { ...prev, useReranker } : prev))}
      />

      <AppButton
        variant="cta"
        size="compact"
        label={t('search.models.save')}
        icon={ActionIcons.save}
        loading={saving}
        disabled={saving || isLoading}
        onPress={() => void saveSettings()}
      />
    </View>
  ) : null;

  if (isLoading) {
    return (
      <StatePanel isEmpty={false} emptyLabel="">
        <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
            {t('search.models.loading')}
          </Text>
        </View>
      </StatePanel>
    );
  }

  return (
    <StatePanel isEmpty={!draft} emptyLabel={t('search.models.unavailable')}>
      {draft ? (
        <SearchConfigPanelCard
          icon={Cpu}
          title={t('search.models.title')}
          subtitle={t('search.models.description')}>
          {settingsForm}
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1 },
});
