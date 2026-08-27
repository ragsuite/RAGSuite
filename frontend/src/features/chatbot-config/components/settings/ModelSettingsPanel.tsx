import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Cpu } from 'lucide-react-native';

import { ChatbotEmbeddingReindexBanner } from '@/features/chatbot-config/components/settings/ChatbotEmbeddingReindexBanner';
import { ChatbotModelApiKeyConnectionHint } from '@/features/chatbot-config/components/settings/ChatbotModelApiKeyConnectionHint';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { ModelSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import {
  getChatModelsForProvider,
  normalizeModelProviderKey,
  resolveChatModelsForProvider,
  resolveEmbeddingModelOptions,
  resolveProviderOptions,
} from '@/features/search-config/utils/model-settings-options';
import {
  hasUsableSavedApiKeyForProvider,
  isOllamaPlaceholderKey,
  isOllamaProvider,
  resolveApiKeyForModelSave,
  resolveOllamaApiKeyDraft,
} from '@/features/search-config/utils/search-model-settings';
import {
  formatApiKeyFieldDisplay,
  isMaskedApiKey,
  lookupProviderApiKeyMask,
} from '@/features/search-config/utils/search-settings-api';
import type { ModelProvider } from '@/features/search-config/types/search-config.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

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
  value: number,
  onChange: (n: number) => void,
  keyboardType: 'decimal-pad' | 'number-pad' = 'decimal-pad',
) {
  return (
    <AppTextField
      label={label}
      value={String(value)}
      keyboardType={keyboardType}
      onChangeText={(text) => {
        const n = keyboardType === 'number-pad' ? Number.parseInt(text, 10) : Number.parseFloat(text);
        if (!Number.isNaN(n)) onChange(n);
      }}
    />
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
    topKResults: settings.topKResults ?? 5,
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
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { bundle, saving, refreshing, notify, handleSaveModelSettings, handleRefreshModelStatus } =
    useChatbotConfig();
  const [draft, setDraft] = useState<ModelSettings | null>(null);
  const [embeddingRefreshKey, setEmbeddingRefreshKey] = useState(0);
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const hasPopulatedApiKey = useRef(false);
  const settingsSnapshotRef = useRef<string>('');

  useEffect(() => {
    if (!bundle?.modelSettings) return;
    const snapshot = JSON.stringify(bundle.modelSettings);
    if (snapshot === settingsSnapshotRef.current && draft) return;
    settingsSnapshotRef.current = snapshot;
    hasPopulatedApiKey.current = false;
    setApiKeyEditing(false);
    setDraft(buildDraftFromBundle(bundle.modelSettings));
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

  const onProviderChange = (provider: string) => {
    const normalizedProvider = normalizeModelProviderKey(provider as ModelProvider);
    setApiKeyEditing(false);
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

    const { error: keyError } = resolveApiKeyForModelSave(draft.apiKey, hasSavedApiKey, draft.provider);
    if (keyError) {
      notify(keyError, 'error');
      return;
    }

    await handleSaveModelSettings(draft);
    setEmbeddingRefreshKey((key) => key + 1);
    hasPopulatedApiKey.current = true;
    setApiKeyEditing(false);
  };

  const settingsForm = draft ? (
    <View style={{ gap: spacing.md }}>
      <AppSelectField
        label={t('chatbot.models.provider.label')}
        value={draft.provider}
        options={providerOptions}
        onChange={onProviderChange}
      />

      <View style={{ gap: 4 }}>
        <AppSelectField
          label={t('chatbot.models.chatModel.label')}
          value={draft.chatModel}
          options={
            chatModelOptions.length > 0
              ? chatModelOptions
              : [{ key: draft.chatModel, label: draft.chatModel || t('chatbot.models.chatModel.noneAvailable') }]
          }
          onChange={(chatModel) => setDraft((prev) => (prev ? { ...prev, chatModel } : prev))}
        />
        <FieldHint>{t('chatbot.models.chatModel.helper')}</FieldHint>
      </View>

      <View style={{ gap: 4 }}>
        {embeddingOptions.length > 0 ? (
          <AppSelectField
            label={t('chatbot.models.embeddingModel.label')}
            value={draft.embeddingModel}
            options={embeddingOptions}
            onChange={(embeddingModel) => setDraft((prev) => (prev ? { ...prev, embeddingModel } : prev))}
          />
        ) : (
          <AppTextField
            label={t('chatbot.models.embeddingModel.label')}
            value={draft.embeddingModel}
            placeholder={
              draft.provider
                ? t('chatbot.models.embeddingModel.noneAvailable')
                : t('chatbot.models.embeddingModel.selectProvider')
            }
            editable={false}
            onChangeText={() => undefined}
          />
        )}
        <FieldHint>
          {draft.embeddingModel
            ? t('chatbot.models.embeddingModel.helper')
            : t('chatbot.models.embeddingModel.noneAvailable')}
        </FieldHint>
      </View>

      <ChatbotEmbeddingReindexBanner
        refreshKey={`${embeddingRefreshKey}-${draft.embeddingModel}-${draft.provider}`}
        onReindexFinished={() => {
          void handleRefreshModelStatus();
        }}
      />

      <View style={{ gap: 4 }}>
        <AppTextField
          label={t('chatbot.models.apiKey.label')}
          placeholder={
            isOllama
              ? t('chatbot.models.apiKey.ollamaPlaceholder')
              : hasSavedApiKey
                ? t('chatbot.models.apiKey.savedPlaceholder')
                : t('chatbot.models.apiKey.placeholder')
          }
          value={draft.apiKey}
          secureTextEntry={!isOllama && apiKeyEditing && !isMaskedApiKey(draft.apiKey)}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="oneTimeCode"
          importantForAutofill="no"
          editable={!isOllama}
          onFocus={() => {
            if (isOllama) return;
            if (hasSavedApiKey && isMaskedApiKey(draft.apiKey)) {
              setApiKeyEditing(true);
              setDraft((prev) => (prev ? { ...prev, apiKey: '' } : prev));
            } else {
              setApiKeyEditing(true);
            }
          }}
          onBlur={() => {
            if (isOllama) return;
            setDraft((prev) => {
              if (!prev) return prev;
              if (prev.apiKey.trim() && !isMaskedApiKey(prev.apiKey)) {
                setApiKeyEditing(true);
                return prev;
              }
              const mask =
                lookupProviderApiKeyMask(prev.providerApiKeys, prev.provider) ||
                prev.apiKeyMasked?.trim() ||
                '';
              setApiKeyEditing(false);
              return {
                ...prev,
                apiKey: mask ? formatApiKeyFieldDisplay(mask) : '',
              };
            });
          }}
          onChangeText={(apiKey) => {
            hasPopulatedApiKey.current = true;
            setApiKeyEditing(true);
            setDraft((prev) =>
              prev
                ? {
                    ...prev,
                    apiKey: isMaskedApiKey(apiKey) ? '' : apiKey,
                  }
                : prev,
            );
          }}
        />
        <FieldHint>
          {isOllama
            ? t('chatbot.models.apiKey.ollamaHelper')
            : hasSavedApiKey && showingSavedMask
              ? t('models.apiKey.replaceHelper')
              : t('chatbot.models.apiKey.helper')}
        </FieldHint>
        <ChatbotModelApiKeyConnectionHint
          provider={draft.provider}
          apiKey={draft.apiKey}
          chatModel={draft.chatModel}
          embeddingModel={draft.embeddingModel}
          hasSavedApiKey={hasSavedApiKey}
        />
      </View>

      <SectionDivider />

      {numField(t('chatbot.models.parameters.temperature'), draft.temperature, (temperature) =>
        setDraft((prev) => (prev ? { ...prev, temperature } : prev)),
      )}
      {numField(t('chatbot.models.parameters.topP'), draft.topP, (topP) => setDraft((prev) => (prev ? { ...prev, topP } : prev)))}
      {numField(
        t('chatbot.models.parameters.bestOf'),
        draft.bestOf,
        (bestOf) => setDraft((prev) => (prev ? { ...prev, bestOf } : prev)),
        'number-pad',
      )}
      {numField(t('chatbot.models.parameters.frequencyPenalty'), draft.frequencyPenalty, (frequencyPenalty) =>
        setDraft((prev) => (prev ? { ...prev, frequencyPenalty } : prev)),
      )}
      {numField(t('chatbot.models.parameters.presencePenalty'), draft.presencePenalty, (presencePenalty) =>
        setDraft((prev) => (prev ? { ...prev, presencePenalty } : prev)),
      )}

      <SectionDivider />

      <View style={{ gap: 4 }}>
        <AppRangeField
          label={t('chatbot.models.rag.topK')}
          value={draft.topKResults}
          min={3}
          max={20}
          step={1}
          formatValue={(v) => String(v)}
          onChange={(topKResults) => setDraft((prev) => (prev ? { ...prev, topKResults } : prev))}
        />
        <FieldHint>{t('chatbot.models.rag.topKHelper')}</FieldHint>
      </View>

      <View style={{ gap: 4 }}>
        <AppRangeField
          label={t('chatbot.models.rag.similarityThreshold')}
          value={draft.similarityThreshold}
          min={0.1}
          max={1}
          step={0.1}
          formatValue={(v) => v.toFixed(2)}
          onChange={(similarityThreshold) =>
            setDraft((prev) => (prev ? { ...prev, similarityThreshold } : prev))
          }
        />
        <FieldHint>{t('chatbot.models.rag.similarityThresholdHelper')}</FieldHint>
      </View>

      <View style={{ gap: 4 }}>
        <AppRangeField
          label={t('chatbot.models.rag.maxTokens')}
          value={draft.maxTokens}
          min={50}
          max={3000}
          step={50}
          formatValue={(v) => String(v)}
          onChange={(maxTokens) => setDraft((prev) => (prev ? { ...prev, maxTokens } : prev))}
        />
        <FieldHint>{t('chatbot.models.rag.maxTokensHelper')}</FieldHint>
      </View>

      <AppSwitchRow
        bordered
        label={t('chatbot.models.rag.useReranker')}
        description={t('chatbot.models.rag.useRerankerHelper')}
        value={draft.useReranker}
        onChange={(useReranker) => setDraft((prev) => (prev ? { ...prev, useReranker } : prev))}
      />

      <AppButton
        variant="cta"
        size="compact"
        label={t('chatbot.models.save')}
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
            {t('chatbot.models.loading')}
          </Text>
        </View>
      </StatePanel>
    );
  }

  return (
    <StatePanel isEmpty={!draft} emptyLabel={t('chatbot.models.unavailable')}>
      {draft ? (
        <SearchConfigPanelCard
          icon={Cpu}
          title={t('chatbot.models.title')}
          subtitle={t('chatbot.models.description')}>
          {settingsForm}
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1 },
});
