import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useRouter, type Href } from 'expo-router';

import { AiAssistantApiKeyConnectionHint } from '@/features/ai-assistant/components/AiAssistantApiKeyConnectionHint';
import { AI_ASSISTANT_CONTENT_MAX } from '@/features/ai-assistant/components/AiAssistantComposerInput';
import type {
  AiAssistantAnswerLength,
  AiAssistantDefaultMode,
  AiAssistantLoadingStyle,
  AiAssistantSettings,
} from '@/features/ai-assistant/types/ai-assistant.types';
import {
  handleGetAiAssistantSettings,
  handlePutAiAssistantSettings,
} from '@/network/actions/ai-assistant.actions';
import { handleGetConfigModelsCatalog } from '@/network/actions/chatbot-config.actions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useAiAssistantContext } from '@/features/ai-assistant/providers/ai-assistant-provider';
import {
  getChatModelsForProvider,
  normalizeModelProviderKey,
  resolveChatModelsForProvider,
  resolveProviderOptions,
} from '@/features/search-config/utils/model-settings-options';
import {
  hasPendingPlaintextApiKey,
  isOllamaProvider,
} from '@/features/search-config/utils/search-model-settings';
import {
  formatApiKeyFieldDisplay,
  isMaskedApiKey,
  lookupProviderApiKeyMask,
  parseProviderApiKeysMap,
} from '@/features/search-config/utils/search-settings-api';
import { parseAvailableSearchModels } from '@/features/search-config/utils/search-api-mappers';
import type { AvailableSearchModels, ModelProvider } from '@/features/search-config/types/search-config.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { LlmEgressWarningBanner } from '@/shared/components/compliance/LlmEgressWarningBanner';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_SECONDARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { useToast } from '@/shared/toast/use-toast';

type SettingsTab = 'models' | 'behavior' | 'sources';

function FieldHint({ children }: { children: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{children}</Text>;
}

function AppliesHint({ mode }: { mode: 'ops' | 'sources' | 'both' }) {
  const { t } = useTranslation();
  const key =
    mode === 'ops'
      ? 'aiAssistant.settings.applies.ops'
      : mode === 'sources'
        ? 'aiAssistant.settings.applies.sources'
        : 'aiAssistant.settings.applies.both';
  return <FieldHint>{t(key)}</FieldHint>;
}

export function AiAssistantSettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, radius, surfaceRadius, typography, isWebParitySurfaces, mode } = useAppTheme();
  const isCompact = useCompactLayout();
  const scrollBottomPadding = useScrollBottomPadding();
  const { activeProjectId } = useActiveProject();
  const { toast } = useToast();
  const { refreshSettings } = useAiAssistantContext();

  const [activeTab, setActiveTab] = useState<SettingsTab>('models');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableSearchModels | null>(null);
  const [provider, setProvider] = useState<ModelProvider>('openai');
  const [chatModel, setChatModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyMasked, setApiKeyMasked] = useState<string | null>(null);
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [temperature, setTemperature] = useState('0.2');
  const [maxTokens, setMaxTokens] = useState('2048');
  const [hasKey, setHasKey] = useState(false);
  const [providerApiKeys, setProviderApiKeys] = useState<Record<string, string>>({});
  const [defaultMode, setDefaultMode] = useState<AiAssistantDefaultMode>('ops');
  const [answerLength, setAnswerLength] = useState<AiAssistantAnswerLength>('balanced');
  const [loadingStyle, setLoadingStyle] = useState<AiAssistantLoadingStyle>('typing');
  const [showCitations, setShowCitations] = useState(false);
  const pendingPlaintextApiKeyRef = useRef('');

  const tabs = useMemo(
    () =>
      [
        { key: 'models' as const, label: t('aiAssistant.settings.tabs.models') },
        { key: 'behavior' as const, label: t('aiAssistant.settings.tabs.behavior') },
        { key: 'sources' as const, label: t('aiAssistant.settings.tabs.sources') },
      ] as const,
    [t],
  );

  const clearPendingApiKey = () => {
    pendingPlaintextApiKeyRef.current = '';
  };

  const applySavedApiKeyState = (settings: AiAssistantSettings, forProvider: ModelProvider) => {
    const map = parseProviderApiKeysMap(settings.provider_api_keys);
    setProviderApiKeys(map);
    const mask =
      lookupProviderApiKeyMask(map, forProvider) || settings.api_key_masked?.trim() || '';
    const has = Boolean(mask);
    setHasKey(has);
    setApiKeyMasked(mask || null);
    setApiKey(has ? formatApiKeyFieldDisplay(mask) : '');
    setApiKeyEditing(false);
  };

  const applyPreferenceState = (settings: AiAssistantSettings) => {
    setDefaultMode(settings.default_mode === 'sources' ? 'sources' : 'ops');
    const length = settings.answer_length;
    setAnswerLength(
      length === 'short' || length === 'detailed' || length === 'balanced' ? length : 'balanced',
    );
    setLoadingStyle(settings.loading_style === 'skeleton' ? 'skeleton' : 'typing');
    setShowCitations(Boolean(settings.show_citations));
  };

  const remaskSavedApiKeyField = () => {
    if (!hasKey || !apiKeyMasked) {
      setApiKeyEditing(false);
      return;
    }
    setApiKey(formatApiKeyFieldDisplay(apiKeyMasked));
    setApiKeyEditing(false);
  };

  useEffect(() => {
    if (!activeProjectId) {
      setLoading(false);
      return;
    }
    void (async () => {
      try {
        const [settings, catalogBody] = await Promise.all([
          handleGetAiAssistantSettings(activeProjectId),
          handleGetConfigModelsCatalog({ projectId: activeProjectId }).catch(() => null),
        ]);
        const catalog = parseAvailableSearchModels(catalogBody);
        setAvailableModels(catalog);

        const nextProvider = normalizeModelProviderKey(
          settings.model_provider || 'openai',
        ) as ModelProvider;
        setProvider(nextProvider);
        setChatModel(settings.chat_model || '');
        applySavedApiKeyState(settings, nextProvider);
        clearPendingApiKey();
        setBaseUrl(settings.base_url || '');
        setTemperature(settings.temperature || '0.2');
        setMaxTokens(settings.max_tokens != null ? String(settings.max_tokens) : '2048');
        applyPreferenceState(settings);
      } catch (error) {
        toast({
          title: t('aiAssistant.toast.loadFailed'),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [activeProjectId, t, toast]);

  const providerOptions = useMemo(() => resolveProviderOptions(availableModels), [availableModels]);
  const chatModelOptions = useMemo(
    () => resolveChatModelsForProvider(provider, availableModels, chatModel),
    [provider, availableModels, chatModel],
  );
  const isOllama = isOllamaProvider(provider);
  const showingSavedMask =
    hasKey && isMaskedApiKey(apiKey) && !hasPendingPlaintextApiKey(pendingPlaintextApiKeyRef.current);

  useEffect(() => {
    if (chatModelOptions.length === 0) return;
    if (!chatModelOptions.some((m) => m.key === chatModel)) {
      setChatModel(chatModelOptions[0]?.key ?? '');
    }
  }, [provider, chatModelOptions, chatModel]);

  const onProviderChange = (next: string) => {
    const normalized = normalizeModelProviderKey(next) as ModelProvider;
    setApiKeyEditing(false);
    clearPendingApiKey();
    setProvider(normalized);
    const options = resolveChatModelsForProvider(normalized, availableModels, null);
    const fallback = options[0]?.key ?? getChatModelsForProvider(normalized)[0]?.key ?? '';
    setChatModel(fallback);
    if (isOllamaProvider(normalized)) {
      setHasKey(false);
      setApiKeyMasked(null);
      setApiKey('');
      return;
    }
    const mask = lookupProviderApiKeyMask(providerApiKeys, normalized);
    setHasKey(Boolean(mask));
    setApiKeyMasked(mask || null);
    setApiKey(mask ? formatApiKeyFieldDisplay(mask) : '');
  };

  const buildPayload = (includePendingKey: boolean) => {
    const payload: Parameters<typeof handlePutAiAssistantSettings>[1] = {
      model_provider: provider,
      chat_model: chatModel.trim(),
      base_url: baseUrl.trim() || undefined,
      temperature: temperature.trim() || undefined,
      max_tokens: maxTokens.trim() ? Number(maxTokens) : null,
      default_mode: defaultMode,
      answer_length: answerLength,
      show_citations: showCitations,
      loading_style: loadingStyle,
    };
    const pending = pendingPlaintextApiKeyRef.current.trim();
    if (includePendingKey && pending && !isMaskedApiKey(pending)) {
      payload.api_key = pending;
    }
    return payload;
  };

  const onCancel = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(app)/ai-assistant' as Href);
  };

  const onSave = async () => {
    if (!activeProjectId) return;
    setSaving(true);
    try {
      const saved: AiAssistantSettings = await handlePutAiAssistantSettings(
        activeProjectId,
        buildPayload(true),
      );
      applySavedApiKeyState(
        saved,
        normalizeModelProviderKey(saved.model_provider || provider) as ModelProvider,
      );
      applyPreferenceState(saved);
      clearPendingApiKey();
      await refreshSettings();
      toast({ title: t('aiAssistant.toast.settingsSaved') });
    } catch (error) {
      toast({
        title: t('aiAssistant.toast.settingsFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const persistPendingApiKeyBeforeTest = async () => {
    if (!activeProjectId) return;
    const pending = pendingPlaintextApiKeyRef.current.trim();
    if (!pending || isMaskedApiKey(pending)) return;
    try {
      const saved = await handlePutAiAssistantSettings(activeProjectId, buildPayload(true));
      applySavedApiKeyState(
        saved,
        normalizeModelProviderKey(saved.model_provider || provider) as ModelProvider,
      );
      applyPreferenceState(saved);
      clearPendingApiKey();
      await refreshSettings();
    } catch (error) {
      toast({
        title: t('aiAssistant.toast.settingsFailed'),
        description: error instanceof Error ? error.message : undefined,
        variant: 'destructive',
      });
      throw error;
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        }}
      >
        <Pressable
          accessibilityLabel={t('common.back')}
          onPress={onCancel}
          style={({ pressed, hovered }) => ({
            width: 40,
            height: 40,
            borderRadius: radius.md,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: pressed
              ? colors.surfaceMuted
              : hovered
                ? colors.surfaceHover
                : colors.surface,
          })}
        >
          <ArrowLeft size={18} color={colors.text} />
        </Pressable>
      </View>

      <AppScrollView contentContainerStyle={{ paddingBottom: scrollBottomPadding }}>
        <View
          style={{
            width: '100%',
            maxWidth: AI_ASSISTANT_CONTENT_MAX,
            alignSelf: 'center',
            paddingHorizontal: spacing.lg,
            gap: spacing.lg,
            paddingTop: spacing.lg,
          }}
        >
          <PageSectionHeader
            title={t('aiAssistant.settings.title')}
            subtitle={t('aiAssistant.settings.subtitle')}
          />

          <View accessibilityRole="tablist">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={isCompact}
              contentContainerStyle={{ gap: spacing.xs, paddingVertical: 2 }}
            >
              {tabs.map((tab) => {
                const active = tab.key === activeTab;
                return (
                  <Pressable
                    key={tab.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${tab.label} tab`}
                    onPress={() => setActiveTab(tab.key)}
                    style={({ pressed, hovered }) => {
                      const chrome = getWebParityTabStyle({
                        active,
                        pressed,
                        hovered,
                        colors,
                        surfaceRadius,
                        brandRadius: radius.lg,
                        useWebParity: isWebParitySurfaces,
                        colorMode: mode,
                      });
                      return [
                        getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_SECONDARY),
                        { paddingHorizontal: spacing.md },
                      ];
                    }}
                  >
                    <Text
                      style={[
                        typography.caption,
                        getWebParityTabLabelStyle(
                          getWebParityTabStyle({
                            active,
                            pressed: false,
                            colors,
                            surfaceRadius,
                            brandRadius: radius.lg,
                            useWebParity: isWebParitySurfaces,
                            colorMode: mode,
                          }).textColor,
                          typography.caption,
                        ),
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {activeTab === 'models' ? (
            <View style={{ gap: spacing.md }}>
              <AppSelectField
                label={t('aiAssistant.settings.provider')}
                value={provider}
                options={providerOptions}
                onChange={onProviderChange}
              />
              <LlmEgressWarningBanner provider={provider} />
              <AppliesHint mode="ops" />

              <AppSelectField
                label={t('aiAssistant.settings.model')}
                value={chatModel}
                options={
                  chatModelOptions.length > 0
                    ? chatModelOptions
                    : [{ key: chatModel || 'none', label: chatModel || t('aiAssistant.settings.noModels') }]
                }
                onChange={setChatModel}
              />
              <AppliesHint mode="ops" />

              <View style={{ gap: 4 }}>
                <AppTextField
                  label={t('aiAssistant.settings.apiKey')}
                  placeholder={
                    isOllama
                      ? t('chatbot.models.apiKey.ollamaPlaceholder')
                      : hasKey
                        ? t('chatbot.models.apiKey.savedPlaceholder')
                        : t('chatbot.models.apiKey.placeholder')
                  }
                  value={apiKey}
                  secureTextEntry={
                    !isOllama && apiKeyEditing && Boolean(apiKey.trim()) && !isMaskedApiKey(apiKey)
                  }
                  autoCapitalize="none"
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                  {...(Platform.OS === 'web'
                    ? ({ name: 'ragsuite-ai-assistant-api-key' } as object)
                    : null)}
                  editable={!isOllama}
                  onFocus={() => {
                    if (isOllama) return;
                    setApiKeyEditing(true);
                    const pending = pendingPlaintextApiKeyRef.current.trim();
                    if (pending) {
                      setApiKey(pending);
                      return;
                    }
                    if (hasKey && isMaskedApiKey(apiKey)) {
                      setApiKey('');
                    }
                  }}
                  onBlur={() => {
                    if (isOllama) return;
                    if (hasKey) {
                      remaskSavedApiKeyField();
                      return;
                    }
                    setApiKeyEditing(false);
                  }}
                  onChangeText={(next) => {
                    setApiKeyEditing(true);
                    const nextKey = isMaskedApiKey(next) ? '' : next;
                    pendingPlaintextApiKeyRef.current = nextKey.trim();
                    setApiKey(nextKey);
                  }}
                />
                <FieldHint>
                  {isOllama
                    ? t('chatbot.models.apiKey.ollamaHelper')
                    : hasKey && showingSavedMask
                      ? t('models.apiKey.replaceHelper')
                      : t('chatbot.models.apiKey.helper')}
                </FieldHint>
                <FieldHint>{t('aiAssistant.settings.models.searchNote')}</FieldHint>
                {activeProjectId ? (
                  <AiAssistantApiKeyConnectionHint
                    projectId={activeProjectId}
                    provider={provider}
                    apiKey={apiKey}
                    chatModel={chatModel}
                    baseUrl={baseUrl}
                    hasSavedApiKey={hasKey}
                    pendingPlaintextApiKey={pendingPlaintextApiKeyRef.current}
                    onBeforeTest={persistPendingApiKeyBeforeTest}
                    onTestComplete={remaskSavedApiKeyField}
                  />
                ) : null}
              </View>

              <AppTextField
                label={t('aiAssistant.settings.baseUrl')}
                value={baseUrl}
                onChangeText={setBaseUrl}
                placeholder={t('aiAssistant.settings.baseUrlHint')}
                autoComplete="off"
              />
              <AppTextField
                label={t('aiAssistant.settings.temperature')}
                value={temperature}
                onChangeText={setTemperature}
                placeholder="0.2"
              />
              <AppliesHint mode="ops" />
              <AppTextField
                label={t('aiAssistant.settings.maxTokens')}
                value={maxTokens}
                onChangeText={setMaxTokens}
                placeholder="2048"
              />
              <AppliesHint mode="ops" />
            </View>
          ) : null}

          {activeTab === 'behavior' ? (
            <View style={{ gap: spacing.md }}>
              <AppSelectField
                label={t('aiAssistant.settings.defaultMode')}
                value={defaultMode}
                options={[
                  { key: 'ops', label: t('aiAssistant.settings.defaultMode.ops') },
                  { key: 'sources', label: t('aiAssistant.settings.defaultMode.sources') },
                ]}
                onChange={(next) => setDefaultMode(next === 'sources' ? 'sources' : 'ops')}
              />
              <FieldHint>{t('aiAssistant.settings.defaultMode.hint')}</FieldHint>

              <AppSelectField
                label={t('aiAssistant.settings.answerLength')}
                value={answerLength}
                options={[
                  { key: 'short', label: t('aiAssistant.settings.answerLength.short') },
                  { key: 'balanced', label: t('aiAssistant.settings.answerLength.balanced') },
                  { key: 'detailed', label: t('aiAssistant.settings.answerLength.detailed') },
                ]}
                onChange={(next) =>
                  setAnswerLength(
                    next === 'short' || next === 'detailed' ? next : 'balanced',
                  )
                }
              />
              <FieldHint>{t('aiAssistant.settings.answerLength.hint')}</FieldHint>
              <AppliesHint mode="both" />

              <AppSelectField
                label={t('aiAssistant.settings.loadingStyle')}
                value={loadingStyle}
                options={[
                  { key: 'typing', label: t('aiAssistant.settings.loadingStyle.typing') },
                  { key: 'skeleton', label: t('aiAssistant.settings.loadingStyle.skeleton') },
                ]}
                onChange={(next) => setLoadingStyle(next === 'skeleton' ? 'skeleton' : 'typing')}
              />
              <FieldHint>{t('aiAssistant.settings.loadingStyle.hint')}</FieldHint>
              <AppliesHint mode="both" />
            </View>
          ) : null}

          {activeTab === 'sources' ? (
            <View style={{ gap: spacing.md }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                }}
              >
                <Text style={[typography.body, { color: colors.text, flex: 1 }]}>
                  {t('aiAssistant.settings.showCitations')}
                </Text>
                <Switch
                  value={showCitations}
                  onValueChange={setShowCitations}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={
                    Platform.OS === 'android'
                      ? showCitations
                        ? colors.textOnPrimary
                        : colors.surface
                      : colors.surface
                  }
                  ios_backgroundColor={colors.surfaceMuted}
                />
              </View>
              <FieldHint>{t('aiAssistant.settings.showCitations.hint')}</FieldHint>
              <AppliesHint mode="sources" />
            </View>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: spacing.sm,
              justifyContent: 'flex-start',
            }}
          >
            <AppButton
              label={t('common.cancel')}
              variant="outline"
              onPress={onCancel}
              disabled={saving}
            />
            <AppButton
              label={t('aiAssistant.settings.save')}
              variant="primary"
              onPress={() => void onSave()}
              disabled={saving || !chatModel.trim()}
              loading={saving}
            />
          </View>
        </View>
      </AppScrollView>
    </View>
  );
}
