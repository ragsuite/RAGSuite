import type {
  ActiveTrainingConfig,
  AllowedDomainEntry,
  AvatarOption,
  ChatWidgetConfig,
  ChatWidgetCustomization,
  DomainScope,
  FeedbackSettings,
  ModelSettings,
  ModelStatus,
  SettingsOverview,
  TrainingOverview,
} from '@/features/chatbot-config/types/chatbot-config.types';
import type {
  ChatbotConfigurationUpdate,
  ChatbotCustomizationUpdate,
  ConfigModelsData,
  ConfigModelsUpdate,
} from '@/features/chatbot-config/types/chatbot-api.types';
import { formatModelProviderLabel, normalizeModelProviderKey } from '@/features/search-config/utils/model-settings-options';
import { resolveApiKeyMaskedPresence } from '@/features/search-config/utils/search-settings-api';
import type { EmbeddingStatus } from '@/features/search-config/types/embedding.types';
import {
  allowedUrlRuleToDomainString,
  buildAllowedUrlRuleFromInput,
  inferDomainScope,
  normalizeAllowedUrlEntries,
  type AllowedUrlEntry,
} from '@/features/search-config/utils/allowed-url-rules';
import type { IntegrationsEmbedCache } from '@/features/search-config/utils/search-api-mappers';
import { buildApiUrl } from '@/network/apiUrl';
import { resolveAvatarAssetUrl, mapWidgetAvatarFromApi, resolveWidgetAvatarForApi } from '@/features/chatbot-config/utils/widget-avatar-display';
import {
  DEFAULT_GRADIENT_ANGLE,
  DEFAULT_GRADIENT_COLOR2,
  parseCustomGradient,
} from '@/features/chatbot-config/utils/widget-theme-utils';

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function unwrapChatbotApiData<T>(body: unknown): T | null {
  if (body == null) return null;
  if (typeof body !== 'object') return body as T;
  const record = body as Record<string, unknown>;
  if ('data' in record && record.data != null) return record.data as T;
  return body as T;
}

export type ChatbotPromptPayload = {
  systemPrompt: string;
  isDefault: boolean;
};

export function parseChatbotPromptPayload(body: unknown): ChatbotPromptPayload | null {
  if (typeof body === 'string') {
    const trimmed = body.trim();
    return trimmed ? { systemPrompt: trimmed, isDefault: false } : null;
  }
  const data = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;
  const nested = asRecord(data.config) ?? asRecord(data.settings) ?? asRecord(data.prompt_config);
  const prompt =
    asString(data.system_prompt) ??
    asString(data.prompt) ??
    asString(data.welcome_message) ??
    asString(nested?.system_prompt) ??
    asString(nested?.prompt) ??
    asString(nested?.welcome_message);
  const trimmed = prompt?.trim();
  if (!trimmed) return null;
  return {
    systemPrompt: trimmed,
    isDefault: data.is_default === true,
  };
}

export function parseChatbotPromptResponse(body: unknown): string | null {
  return parseChatbotPromptPayload(body)?.systemPrompt ?? null;
}

export function toChatbotPromptUpdateRequest(systemPrompt: string) {
  const trimmed = systemPrompt.trim();
  return {
    welcome_message: trimmed,
    prompt: trimmed,
    system_prompt: trimmed,
  };
}

export function parseConfigModelsBody(body: unknown): ConfigModelsData | null {
  if (body == null) return null;
  if (typeof body === 'string') {
    try {
      return parseConfigModelsBody(JSON.parse(body));
    } catch {
      return null;
    }
  }
  const data = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;
  const provider = asString(data.model_provider);
  if (!provider) return null;
  return {
    model_provider: provider,
    chat_model: asString(data.chat_model),
    embedding_model: asString(data.embedding_model) ?? '',
    api_key: asString(data.api_key) ?? undefined,
    api_key_masked: asString(data.api_key_masked) ?? asString(data.apiKeyMasked) ?? undefined,
    chat_temperature: data.chat_temperature as ConfigModelsData['chat_temperature'],
    chat_top_p: data.chat_top_p as ConfigModelsData['chat_top_p'],
    chat_best_of: asNumber(data.chat_best_of),
    chat_frequency_penalty: data.chat_frequency_penalty as ConfigModelsData['chat_frequency_penalty'],
    chat_presence_penalty: data.chat_presence_penalty as ConfigModelsData['chat_presence_penalty'],
    chat_top_k: asNumber(data.chat_top_k),
    chat_similarity_threshold: asNumber(data.chat_similarity_threshold),
    chat_max_tokens: asNumber(data.chat_max_tokens),
    chat_use_reranker: asBoolean(data.chat_use_reranker),
  };
}

function parseNumericField(value: string | number | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function resolveApiKeyMaskedFromConfigModels(
  data: ConfigModelsData,
  current: string,
): string {
  return resolveApiKeyMaskedPresence({
    apiKeyMasked: data.api_key_masked,
    apiKey: data.api_key,
    current,
  });
}

export function mapConfigModelsToSettings(
  data: ConfigModelsData,
  current: ModelSettings,
): ModelSettings {
  return {
    ...current,
    provider: normalizeModelProviderKey(data.model_provider),
    chatModel: data.chat_model?.trim() || current.chatModel,
    embeddingModel: data.embedding_model?.trim() || current.embeddingModel,
    apiKeyMasked: resolveApiKeyMaskedFromConfigModels(data, current.apiKeyMasked),
    apiKey: '',
    temperature: parseNumericField(data.chat_temperature, current.temperature),
    topP: parseNumericField(data.chat_top_p, current.topP),
    bestOf: data.chat_best_of ?? current.bestOf,
    frequencyPenalty: parseNumericField(data.chat_frequency_penalty, current.frequencyPenalty),
    presencePenalty: parseNumericField(data.chat_presence_penalty, current.presencePenalty),
    topKResults: data.chat_top_k ?? current.topKResults,
    similarityThreshold: data.chat_similarity_threshold ?? current.similarityThreshold,
    maxTokens: data.chat_max_tokens ?? current.maxTokens,
    useReranker: data.chat_use_reranker ?? current.useReranker,
  };
}

export function mapSettingsToConfigModelsUpdate(settings: ModelSettings): ConfigModelsUpdate {
  return {
    model_provider: settings.provider,
    chat_model: settings.chatModel,
    embedding_model: settings.embeddingModel,
    api_key: settings.apiKey?.trim() || undefined,
    chat_temperature: String(settings.temperature),
    chat_top_p: String(settings.topP),
    chat_best_of: settings.bestOf,
    chat_frequency_penalty: String(settings.frequencyPenalty),
    chat_presence_penalty: String(settings.presencePenalty),
    chat_top_k: settings.topKResults,
    chat_similarity_threshold: settings.similarityThreshold,
    chat_max_tokens: settings.maxTokens,
    chat_use_reranker: settings.useReranker,
  };
}

export function parseChatbotActivationStatus(body: unknown): boolean | null {
  const record = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!record) return null;
  const nested = asRecord(record.data);
  const value =
    asBoolean(record.is_active) ??
    asBoolean(record.isActive) ??
    asBoolean(nested?.is_active) ??
    asBoolean(nested?.isActive);
  return value;
}

export type ChatbotSettingsPayload = {
  configuration: Record<string, unknown>;
  customization: Record<string, unknown>;
};

export function parseChatbotSettingsPayload(body: unknown): ChatbotSettingsPayload | null {
  const record = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!record) return null;
  const configuration = asRecord(record.configuration) ?? {};
  const customization = asRecord(record.customization) ?? {};
  return { configuration, customization };
}

export function resolveWidgetPositionFromApi(
  configuration: Record<string, unknown>,
  customization?: Record<string, unknown>,
): ChatWidgetConfig['position'] | null {
  const positionRaw =
    asString(customization?.widget_position) ??
    asString(configuration.widget_position) ??
    asString(configuration.chatbot_position);
  if (positionRaw === 'bottom-left' || positionRaw === 'bottom-right') {
    return positionRaw;
  }
  return null;
}

export function mapChatWidgetConfigFromApi(
  configuration: Record<string, unknown>,
  current: ChatWidgetConfig,
  customization?: Record<string, unknown>,
): ChatWidgetConfig {
  const position = resolveWidgetPositionFromApi(configuration, customization) ?? current.position;
  const welcomeMessage = asString(configuration.welcome_message) ?? current.welcomeMessage;
  const bubbleMessage = asString(configuration.bubble_message) ?? current.bubbleMessage;
  return {
    ...current,
    title: asString(configuration.chatbot_title) ?? current.title,
    bubbleMessage,
    welcomeMessage,
    language: asString(configuration.chatbot_language) ?? current.language,
    greeting: welcomeMessage,
    launcherLabel: bubbleMessage,
    position,
    accentColor:
      asString(customization?.widget_chatbot_color) ??
      asString(configuration.widget_chatbot_color) ??
      current.accentColor,
  };
}

export function mapChatWidgetConfigToApi(config: ChatWidgetConfig, feedbackEnabled?: boolean): ChatbotConfigurationUpdate {
  return {
    chatbot_title: config.title.trim(),
    short_description: '',
    bubble_message: config.bubbleMessage,
    welcome_message: config.welcomeMessage,
    chatbot_language: config.language,
    feedback_enabled: feedbackEnabled,
  };
}

export function parseChatbotConfigurationResponse(body: unknown): Record<string, unknown> | null {
  const data = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;
  return asRecord(data.configuration) ?? data;
}

export function parseChatbotCustomizationResponse(body: unknown): Record<string, unknown> | null {
  const data = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  return data;
}

export function mapChatWidgetCustomizationFromApi(
  customization: Record<string, unknown>,
  current: ChatWidgetCustomization,
): ChatWidgetCustomization {
  const widgetAvatar = asString(customization.widget_avatar);
  const avatarFields = mapWidgetAvatarFromApi(widgetAvatar, current.avatarId || 'default-1');
  const width = asNumber(customization.widget_width);
  const height = asNumber(customization.widget_height);
  const widgetChatbotColor = asString(customization.widget_chatbot_color) ?? current.primaryColor;
  let secondaryColor = current.secondaryColor || DEFAULT_GRADIENT_COLOR2;
  let gradientAngle = current.gradientAngle || DEFAULT_GRADIENT_ANGLE;

  if (widgetChatbotColor?.startsWith('linear-gradient')) {
    const parsed = parseCustomGradient(widgetChatbotColor);
    if (parsed) {
      secondaryColor = parsed.color2;
      gradientAngle = parsed.angle;
    }
  }

  return {
    ...current,
    logoUrl: asString(customization.widget_logo_url),
    avatarId: avatarFields.avatarId,
    avatarUrl: avatarFields.avatarUrl,
    primaryColor: widgetChatbotColor,
    headerColor: widgetChatbotColor,
    secondaryColor,
    gradientAngle,
    backgroundColor: asString(customization.widget_background_color) ?? current.backgroundColor,
    textColor: asString(customization.widget_text_color) ?? current.textColor,
    fontSize: asNumber(customization.widget_font_size) ?? current.fontSize,
    bubbleRadius: asNumber(customization.widget_trigger_border_radius) ?? current.bubbleRadius,
    panelBorderRadius: asNumber(customization.widget_panel_border_radius) ?? current.panelBorderRadius ?? 20,
    avatarSize: asNumber(customization.widget_avatar_size) ?? current.avatarSize,
    widgetBottomSpace: asNumber(customization.widget_bottom_space) ?? current.widgetBottomSpace,
    customWidthEnabled: width != null && width > 0,
    widgetWidth: width ?? current.widgetWidth,
    customHeightEnabled: height != null && height > 0,
    widgetHeight: height ?? current.widgetHeight ?? 600,
    showLogo: asBoolean(customization.widget_show_logo) ?? current.showLogo,
    showDateTime: asBoolean(customization.widget_show_date_time) ?? current.showDateTime,
    showBackdrop: asBoolean(customization.widget_show_backdrop) ?? current.showBackdrop ?? false,
  };
}

export function mapChatWidgetCustomizationToApi(
  customization: ChatWidgetCustomization,
  config: ChatWidgetConfig,
): ChatbotCustomizationUpdate {
  const widgetAvatar = resolveWidgetAvatarForApi(customization);

  return {
    widget_logo_url: customization.logoUrl,
    widget_avatar: widgetAvatar,
    widget_avatar_size: customization.avatarSize,
    widget_chatbot_color: customization.primaryColor,
    widget_background_color: customization.backgroundColor,
    widget_text_color: customization.textColor,
    widget_width: customization.customWidthEnabled ? customization.widgetWidth : null,
    widget_height: customization.customHeightEnabled ? customization.widgetHeight : null,
    widget_show_logo: customization.showLogo,
    widget_show_date_time: customization.showDateTime,
    widget_show_backdrop: Boolean(customization.showBackdrop),
    widget_bottom_space: customization.widgetBottomSpace,
    widget_font_size: customization.fontSize,
    widget_trigger_border_radius: customization.bubbleRadius,
    widget_panel_border_radius: customization.panelBorderRadius ?? 20,
    widget_position: config.position,
    widget_z_index: 50,
    widget_offset_x: 0,
    widget_offset_y: 0,
  };
}

export function mapFeedbackFromConfiguration(configuration: Record<string, unknown>, current: FeedbackSettings): FeedbackSettings {
  const enabled = asBoolean(configuration.feedback_enabled);
  return {
    collectFeedback: enabled ?? current.collectFeedback,
  };
}

export function mapEmbeddingStatusToChatbotModelStatus(status: EmbeddingStatus): ModelStatus {
  return {
    projectId: status.project_id,
    source: status.source,
    activeProvider: status.active_provider,
    activeModel: status.active_model,
    activeCollection: status.active_collection,
    activeVectors: status.active_vectors,
    totalDocuments: status.total_documents,
    needsReindex: status.needs_reindex,
    modelMeta: {
      dim: status.model_meta.dim,
      maxTokens: status.model_meta.max_tokens,
      batch: status.model_meta.batch,
      metric: status.model_meta.metric,
      normalize: status.model_meta.normalize,
      needsApiKey: status.model_meta.needs_api_key,
      known: status.model_meta.known,
    },
    fallbackUsed: status.fallback_used,
  };
}

export function buildSettingsOverview(
  modelSettings: ModelSettings,
  chatWidgetConfig: ChatWidgetConfig,
  chatWidgetCustomization: ChatWidgetCustomization,
  domainCount: number,
  chatbotActive: boolean,
): SettingsOverview {
  return {
    provider: modelSettings.provider,
    chatModel: modelSettings.chatModel,
    embeddingModel: modelSettings.embeddingModel,
    apiKeyMasked: modelSettings.apiKeyMasked,
    chatbotTitle: chatWidgetConfig.title,
    language: chatWidgetConfig.language,
    widgetPosition: chatWidgetConfig.position,
    avatarSize: chatWidgetCustomization.avatarSize,
    showLogo: chatWidgetCustomization.showLogo,
    showDateTime: chatWidgetCustomization.showDateTime,
    domainCount,
    domainPreview: [],
    modelLabel: `${formatModelProviderLabel(modelSettings.provider)} · ${modelSettings.chatModel}`,
    widgetPublished: chatbotActive,
    lastPublishedAt: null,
  };
}

export function buildActiveConfig(
  modelSettings: ModelSettings,
  systemPrompt: string,
  chatbotActive: boolean,
  documentCount: number,
  systemPromptIsDefault = false,
): ActiveTrainingConfig {
  return {
    id: 'chat_cfg_active',
    name: 'Production Chatbot',
    model: modelSettings.chatModel,
    status: 'active',
    updatedAt: new Date().toISOString(),
    documentCount,
    embeddingModel: modelSettings.embeddingModel,
    chatbotActive,
    systemPrompt,
    systemPromptIsDefault,
  };
}

export function buildTrainingOverview(
  modelStatus: ModelStatus | null,
  chatbotActive: boolean,
): TrainingOverview {
  return {
    indexedDocuments: modelStatus?.totalDocuments ?? 0,
    lastTrainedAt: null,
    activeConfigName: 'Production Chatbot',
    chatReady: chatbotActive,
    avgLatencyMs: 0,
  };
}

export function mapChatbotDomainsFromEmbed(
  embed: IntegrationsEmbedCache,
  scopeByDomain: Map<string, DomainScope>,
): AllowedDomainEntry[] {
  const entries = normalizeAllowedUrlEntries((embed.chatbot_domains ?? []) as AllowedUrlEntry[]);
  return entries.map((rule, index) => {
    const domain = allowedUrlRuleToDomainString(rule);
    const scope = scopeByDomain.get(domain) ?? inferDomainScope(rule);
    scopeByDomain.set(domain, scope);
    return {
      id: `dom_${rule.hostname}_${rule.pathname}_${index}`,
      domain,
      scope,
      addedAt: new Date().toISOString(),
    };
  });
}

export function mapLegacyChatbotDomainStrings(
  domains: string[],
  scopeByDomain: Map<string, DomainScope>,
): AllowedDomainEntry[] {
  return normalizeAllowedUrlEntries(domains).map((rule, index) => {
    const domain = allowedUrlRuleToDomainString(rule);
    const scope = scopeByDomain.get(domain) ?? inferDomainScope(rule);
    scopeByDomain.set(domain, scope);
    return {
      id: `dom_${rule.hostname}_${rule.pathname}_${index}`,
      domain,
      scope,
      addedAt: new Date().toISOString(),
    };
  });
}

export function buildChatbotIntegrationsEmbedPayload(
  chatbotDomains: AllowedDomainEntry[],
  existing: IntegrationsEmbedCache,
): Record<string, unknown> {
  const chatbotRules = normalizeAllowedUrlEntries(
    chatbotDomains
      .map((entry) => buildAllowedUrlRuleFromInput(entry.domain, entry.scope))
      .filter((rule): rule is NonNullable<typeof rule> => rule != null) as AllowedUrlEntry[],
  );
  const searchRules = normalizeAllowedUrlEntries((existing.search_domains ?? []) as AllowedUrlEntry[]);

  return {
    publicId: existing.publicId ?? `chatbot-widget-${Date.now().toString(36)}`,
    keys: existing.keys ?? [],
    domains: [],
    chatbot_domains: chatbotRules,
    search_domains: searchRules,
  };
}

export function buildDefaultAvatarOptions(): AvatarOption[] {
  return [1, 2, 3, 4].map((index) => ({
    id: `default-${index}`,
    name: `Default ${index}`,
    filename: `avatar-${index}.png`,
    url: buildApiUrl(`/api/v1/avatars/avatar-${index}.png`),
  }));
}

export function parseAvatarsResponse(body: unknown): AvatarOption[] | null {
  const record = unwrapChatbotApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!record) return null;
  const items = record.avatars ?? record.items;
  if (!Array.isArray(items)) return null;

  const out: AvatarOption[] = [];
  for (const item of items) {
    const row = asRecord(item);
    if (!row) continue;
    const id = asString(row.id);
    const url = asString(row.url);
    if (!id || !url) continue;
    out.push({
      id,
      name: asString(row.name) ?? id,
      filename: asString(row.filename) ?? `${id}.png`,
      url: resolveAvatarAssetUrl(url) ?? url,
    });
  }
  return out.length > 0 ? out : null;
}
