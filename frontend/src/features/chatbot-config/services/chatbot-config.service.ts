import type {
  ActiveTrainingConfig,
  AllowedDomainEntry,
  AvatarOption,
  ChatHistoryApiRow,
  ChatWidgetConfig,
  ChatWidgetCustomization,
  ChatbotConfigBundle,
  DomainScope,
  FeedbackSettings,
  PrivacySettings,
  ModelSettings,
  ModelStatus,
  SettingsSection,
} from '@/features/chatbot-config/types/chatbot-config.types';
import {
  buildActiveConfig,
  buildChatbotIntegrationsEmbedPayload,
  buildDefaultAvatarOptions,
  buildSettingsOverview,
  buildTrainingOverview,
  mapChatWidgetConfigFromApi,
  mapChatWidgetConfigToApi,
  mapChatWidgetCustomizationFromApi,
  mapChatWidgetCustomizationToApi,
  mapConfigModelsToSettings,
  mapChatbotDomainsFromEmbed,
  mapLegacyChatbotDomainStrings,
  mapEmbeddingStatusToChatbotModelStatus,
  mapFeedbackFromConfiguration,
  mapPrivacyFromConfiguration,
  mapPrivacySettingsToApi,
  mapSettingsToConfigModelsUpdate,
  parseChatbotActivationStatus,
  parseChatbotCustomizationResponse,
  parseChatbotPromptPayload,
  parseChatbotPromptResponse,
  parseChatbotSettingsPayload,
  parseChatbotConfigurationResponse,
  parseConfigModelsBody,
  parseAvatarsResponse,
  toChatbotPromptUpdateRequest,
} from '@/features/chatbot-config/utils/chatbot-api-mappers';
import {
  buildChatbotMobileIntegrationSnippet,
  buildChatbotWebIntegrationSnippet,
  normalizeChatbotEmbedApiEndpoint,
} from '@/features/chatbot-config/utils/chatbot-integration-snippets';
import { buildIntegrationCredentials } from '@/shared/utils/integration-credentials';
import {
  buildTrainingStats,
  conversationsToLegacyEntries,
  mapChatHistoryRowsToConversations,
} from '@/features/chatbot-config/utils/chat-history-mapper';
import type { EmbeddingSource, EmbeddingStatus } from '@/features/search-config/types/embedding.types';
import {
  parseAvailableSearchModels,
  parseEmbeddingStatus,
  parseIntegrationsEmbedResponse,
  parseReindexProgress,
  type IntegrationsEmbedCache,
} from '@/features/search-config/utils/search-api-mappers';
import {
  formatConnectionTestError,
  formatSplitConnectionTestResult,
  hasUsableSavedApiKeyForProvider,
  resolveApiKeyForConnectionTest,
  resolveApiKeyForPersist,
  resolveEmbeddingModelForSave,
} from '@/features/search-config/utils/search-model-settings';
import {
  formatApiKeyFieldDisplay,
  normalizeProviderApiKeyFamily,
  toApiKeyPresenceMarker,
} from '@/features/search-config/utils/search-settings-api';
import { resolveEmbeddingModelOptions } from '@/features/search-config/utils/model-settings-options';
import {
  allowedDomainRuleKey,
  allowedUrlRuleToDomainString,
  buildAllowedUrlRuleFromInput,
  ruleFromAllowedDomainEntry,
} from '@/features/search-config/utils/allowed-url-rules';
import { handleGetChatHistory, handleExportChatHistory } from '@/network/actions/chat-history.actions';
import {
  handleClearChatSession,
  handleDeleteAllChatMessages,
  handleGetChatbotActivation,
  handleGetChatbotSettings,
  handleGetChatPrompt,
  handleGetAvatars,
  handleGetConfigModels,
  handleGetConfigModelsCatalog,
  handleGetIntegrationsEmbed,
  handleSaveChatPrompt,
  handleSaveChatbotConfiguration,
  handleSaveChatbotCustomization,
  handleSaveConfigModels,
  handleTestConfigModels,
  handleUpdateChatbotActivation,
  handleUpdateIntegrationsEmbed,
} from '@/network/actions/chatbot-config.actions';
import {
  handleGetProjectEmbeddingStatus,
  handleGetProjectReindexProgress,
  handlePostProjectReindex,
} from '@/network/actions/embedding.actions';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { brandTokens } from '@/theme/brand-tokens';

const LATENCY_MS = 200;

let activeProjectId: string | null = null;
let historyRows: ChatHistoryApiRow[] = [];
/** Bumped on project switch so in-flight history fetches cannot rewrite the wrong project. */
let historyFetchGeneration = 0;
/** Bumped on project switch so in-flight model settings fetches cannot reapply the wrong project. */
let modelSettingsFetchGeneration = 0;
const domainScopes = new Map<string, DomainScope>();
/** Per-project embed cache so switching projects cannot leak domain lists. */
const integrationsEmbedCacheByProject = new Map<string, IntegrationsEmbedCache>();

function embedCacheKey(projectId: string | null = activeProjectId): string {
  return projectId?.trim() || '__none__';
}

function getIntegrationsEmbedCache(
  projectId: string | null = activeProjectId,
): IntegrationsEmbedCache | null {
  return integrationsEmbedCacheByProject.get(embedCacheKey(projectId)) ?? null;
}

function setIntegrationsEmbedCache(
  cache: IntegrationsEmbedCache,
  projectId: string | null = activeProjectId,
): void {
  integrationsEmbedCacheByProject.set(embedCacheKey(projectId), cache);
}

const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: 'openai',
  chatModel: 'gpt-4.1-mini',
  embeddingModel: 'text-embedding-3-large',
  apiKey: '',
  apiKeyMasked: '',
  providerApiKeys: {},
  temperature: 0.3,
  maxTokens: 1000,
  topP: 0.95,
  bestOf: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  topKResults: 5,
  similarityThreshold: 0.5,
  useReranker: true,
  systemPrompt: '',
};

const { color } = brandTokens;

const DEFAULT_WIDGET_CONFIG: ChatWidgetConfig = {
  title: 'RAGSuite',
  bubbleMessage: 'Chat with us',
  welcomeMessage: 'Hi, how can I help you?',
  language: 'en',
  greeting: 'Hi, how can I help you?',
  placeholder: 'Message...',
  showLauncher: true,
  launcherLabel: 'Chat with us',
  position: 'bottom-right',
  accentColor: BRANDING_DEFAULTS.primaryColor,
};

const DEFAULT_WIDGET_CUSTOMIZATION: ChatWidgetCustomization = {
  logoUrl: null,
  avatarId: 'default-1',
  avatarUrl: null,
  primaryColor: color.pine,
  secondaryColor: color.pineBright,
  gradientAngle: 135,
  fontSize: 15,
  bubbleRadius: 16,
  avatarSize: 38,
  widgetBottomSpace: 15,
  customWidthEnabled: true,
  widgetWidth: 400,
  customHeightEnabled: true,
  widgetHeight: 600,
  panelBorderRadius: 20,
  showBackdrop: false,
  showSpeechInput: true,
  showSpeechOutput: true,
  shadow: true,
  headerColor: color.pine,
  backgroundColor: color.pineDeep,
  textColor: color.paperRaised,
  showLogo: true,
  showDateTime: true,
};

type ServiceState = {
  systemPrompt: string;
  systemPromptIsDefault: boolean;
  chatbotActive: boolean;
  modelSettings: ModelSettings;
  modelStatus: ModelStatus | null;
  availableModels: ChatbotConfigBundle['availableModels'];
  avatarOptions: AvatarOption[];
  allowedDomains: AllowedDomainEntry[];
  chatWidgetConfig: ChatWidgetConfig;
  chatWidgetCustomization: ChatWidgetCustomization;
  feedbackSettings: FeedbackSettings;
  privacySettings: PrivacySettings;
  integrationScripts: ChatbotConfigBundle['integrationScripts'];
  integrationCredentials: ChatbotConfigBundle['integrationCredentials'];
};

let state: ServiceState = {
  systemPrompt: DEFAULT_MODEL_SETTINGS.systemPrompt,
  systemPromptIsDefault: false,
  chatbotActive: true,
  modelSettings: { ...DEFAULT_MODEL_SETTINGS },
  modelStatus: null,
  availableModels: null,
  avatarOptions: buildDefaultAvatarOptions(),
  allowedDomains: [],
  chatWidgetConfig: { ...DEFAULT_WIDGET_CONFIG },
  chatWidgetCustomization: { ...DEFAULT_WIDGET_CUSTOMIZATION },
  feedbackSettings: { collectFeedback: true },
  privacySettings: { storeHistoryEnabled: true },
  integrationScripts: {
    webSnippet: '',
    mobileSnippet: '',
  },
  integrationCredentials: buildIntegrationCredentials(null, normalizeChatbotEmbedApiEndpoint(), null),
};

/**
 * True only after a successful chatbot settings GET for the active project.
 * Prevents pine-green module defaults from being saved when the API was down
 * after a rebuild (Orange → Green persistence bug).
 */
let settingsHydratedFromApi = false;

function syncIntegrationScripts(projectId: string | null = activeProjectId) {
  const token = Date.now().toString(36);
  const resolvedProjectId = projectId ?? 'your-project-id-here';
  state.integrationScripts = {
    webSnippet: buildChatbotWebIntegrationSnippet(token, resolvedProjectId),
    mobileSnippet: buildChatbotMobileIntegrationSnippet({
      projectId: projectId ?? 'YOUR_PROJECT_ID',
    }),
  };
  state.integrationCredentials = buildIntegrationCredentials(
    projectId,
    normalizeChatbotEmbedApiEndpoint(),
    getIntegrationsEmbedCache(projectId),
  );
}

// Populate snippets after module bindings are fully initialized (avoids HMR/partial-export races).
syncIntegrationScripts(null);

export function configureChatbotConfigProject(projectId: string | null) {
  activeProjectId = projectId;
  historyRows = [];
  historyFetchGeneration += 1;
  modelSettingsFetchGeneration += 1;
  settingsHydratedFromApi = false;
  // Clear model settings immediately so Project A's mask cannot flash into Project B.
  state.modelSettings = { ...DEFAULT_MODEL_SETTINGS };
  state.modelStatus = null;
  syncIntegrationScripts(projectId);
}

function assertSettingsHydratedForWrite(label: string) {
  if (settingsHydratedFromApi) return;
  throw new Error(
    `${label} blocked: chatbot settings were not loaded from the server yet. Wait for the page to finish loading, then try again.`,
  );
}

function projectParams(): { projectId?: string } {
  return activeProjectId ? { projectId: activeProjectId } : {};
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function tryRead<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function requireWrite<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error && err.message ? err.message : `${label} failed.`;
    throw new Error(message);
  }
}

/** Match reference web: always read latest embed config before POST. */
async function fetchIntegrationsEmbedFresh(): Promise<IntegrationsEmbedCache> {
  const params = projectParams();
  const read = async (): Promise<IntegrationsEmbedCache | null> => {
    const embed = await tryRead(() => handleGetIntegrationsEmbed(params));
    return embed ? parseIntegrationsEmbedResponse(embed) : null;
  };

  const first = await read();
  if (first) {
    setIntegrationsEmbedCache(first);
    return first;
  }

  const retry = await read();
  if (retry) {
    setIntegrationsEmbedCache(retry);
    return retry;
  }

  return getIntegrationsEmbedCache() ?? {};
}

async function persistDomains(): Promise<void> {
  const current = await fetchIntegrationsEmbedFresh();
  const embedPayload = buildChatbotIntegrationsEmbedPayload(state.allowedDomains, current);
  const saved = await requireWrite('Save domains', () =>
    handleUpdateIntegrationsEmbed(embedPayload, projectParams()),
  );
  const parsed = parseIntegrationsEmbedResponse(saved);
  if (!parsed) throw new Error('errors.api.saveDomainsFailed');
  setIntegrationsEmbedCache(parsed);
  state.allowedDomains = mapChatbotDomainsFromEmbed(parsed, domainScopes);
}

function clone(): ChatbotConfigBundle {
  const conversations = mapChatHistoryRowsToConversations(historyRows);
  const activeConfig = buildActiveConfig(
    state.modelSettings,
    state.systemPrompt,
    state.chatbotActive,
    state.modelStatus?.totalDocuments ?? 0,
    state.systemPromptIsDefault,
  );
  const settingsOverview = buildSettingsOverview(
    state.modelSettings,
    state.chatWidgetConfig,
    state.chatWidgetCustomization,
    state.allowedDomains.length,
    state.chatbotActive,
  );
  settingsOverview.domainPreview = state.allowedDomains.slice(0, 3).map((d) => ({
    domain: d.domain,
    scope: d.scope,
  }));

  return {
    trainingOverview: buildTrainingOverview(state.modelStatus, state.chatbotActive),
    trainingStats: buildTrainingStats(conversations, state.systemPrompt, state.chatbotActive),
    activeConfig,
    conversations,
    chatHistory: conversationsToLegacyEntries(conversations),
    modelStatus: state.modelStatus,
    settingsOverview,
    modelSettings: { ...state.modelSettings, apiKey: '' },
    availableModels: state.availableModels,
    avatarOptions: [...state.avatarOptions],
    allowedDomains: [...state.allowedDomains],
    chatWidgetConfig: { ...state.chatWidgetConfig },
    chatWidgetCustomization: { ...state.chatWidgetCustomization },
    feedbackSettings: { ...state.feedbackSettings },
    privacySettings: { ...state.privacySettings },
    integrationScripts: { ...state.integrationScripts },
    integrationCredentials: { ...state.integrationCredentials },
  };
}

async function loadDomainsRemote(): Promise<IntegrationsEmbedCache | null> {
  const embed = await tryRead(() => handleGetIntegrationsEmbed(projectParams()));
  const parsedEmbed = embed ? parseIntegrationsEmbedResponse(embed) : null;
  if (parsedEmbed) {
    setIntegrationsEmbedCache(parsedEmbed);
    return parsedEmbed;
  }
  return null;
}

type RemoteSlices = {
  settings?: unknown;
  prompt?: unknown;
  activation?: unknown;
  configModels?: unknown;
  availableModels?: unknown;
  avatars?: unknown;
  history?: ChatHistoryApiRow[];
  domains?: IntegrationsEmbedCache | null;
  embeddingStatus?: EmbeddingStatus | null;
};

function applyRemoteSlices(slices: RemoteSlices) {
  if (slices.prompt != null) {
    const parsed = parseChatbotPromptPayload(slices.prompt);
    if (parsed != null) {
      state.systemPrompt = parsed.systemPrompt;
      state.systemPromptIsDefault = parsed.isDefault;
      state.modelSettings = { ...state.modelSettings, systemPrompt: parsed.systemPrompt };
    }
  }

  if (slices.activation != null) {
    const active = parseChatbotActivationStatus(slices.activation);
    if (active != null) state.chatbotActive = active;
  }

  if (slices.configModels != null) {
    const parsed = parseConfigModelsBody(slices.configModels);
    if (parsed) {
      state.modelSettings = mapConfigModelsToSettings(parsed, state.modelSettings);
    }
  }

  if (slices.availableModels != null) {
    state.availableModels = parseAvailableSearchModels(slices.availableModels);
  }

  if (slices.settings != null) {
    const payload = parseChatbotSettingsPayload(slices.settings);
    if (payload) {
      state.chatWidgetConfig = mapChatWidgetConfigFromApi(
        payload.configuration,
        state.chatWidgetConfig,
        payload.customization,
      );
      state.chatWidgetCustomization = mapChatWidgetCustomizationFromApi(
        payload.customization,
        state.chatWidgetCustomization,
      );
      state.feedbackSettings = mapFeedbackFromConfiguration(payload.configuration, state.feedbackSettings);
      state.privacySettings = mapPrivacyFromConfiguration(payload.configuration, state.privacySettings);
      settingsHydratedFromApi = true;
    }
  }

  if (slices.domains) {
    const embed = slices.domains as IntegrationsEmbedCache;
    if (Array.isArray(embed.chatbot_domains)) {
      if (embed.chatbot_domains.length === 0) {
        state.allowedDomains = [];
      } else if (typeof embed.chatbot_domains[0] === 'object') {
        state.allowedDomains = mapChatbotDomainsFromEmbed(embed, domainScopes);
      } else if (typeof embed.chatbot_domains[0] === 'string') {
        state.allowedDomains = mapLegacyChatbotDomainStrings(embed.chatbot_domains as string[], domainScopes);
      }
    }
  }

  // Empty [] is valid for a project with no chats — must replace, not keep prior project rows.
  if (Array.isArray(slices.history)) {
    historyRows = slices.history;
  }

  if (slices.embeddingStatus) {
    state.modelStatus = mapEmbeddingStatusToChatbotModelStatus(slices.embeddingStatus);
  }

  if (slices.avatars != null) {
    state.avatarOptions = parseAvatarsResponse(slices.avatars) ?? buildDefaultAvatarOptions();
  }
}

export async function fetchChatHistory(): Promise<ChatHistoryApiRow[]> {
  const gen = historyFetchGeneration;
  const rows = await handleGetChatHistory({ limit: 200, offset: 0, ...projectParams() });
  if (gen !== historyFetchGeneration) {
    return [...historyRows];
  }
  historyRows = rows;
  return rows;
}

export async function fetchChatbotConfigBundle(): Promise<ChatbotConfigBundle> {
  const params = projectParams();
  const projectId = activeProjectId;
  const gen = historyFetchGeneration;
  const modelGen = modelSettingsFetchGeneration;

  const [
    settings,
    prompt,
    activation,
    configModels,
    availableModels,
    history,
    domains,
    embeddingStatus,
    avatars,
  ] = await Promise.all([
    tryRead(() => handleGetChatbotSettings(params)),
    tryRead(() => handleGetChatPrompt()),
    tryRead(() => handleGetChatbotActivation(params)),
    tryRead(() => handleGetConfigModels(params)),
    tryRead(() => handleGetConfigModelsCatalog()),
    tryRead(() => handleGetChatHistory({ limit: 200, offset: 0, ...params })),
    loadDomainsRemote(),
    projectId
      ? tryRead(() => handleGetProjectEmbeddingStatus(projectId, 'chat')).then((raw) =>
          raw ? parseEmbeddingStatus(raw) : null,
        )
      : Promise.resolve(null),
    tryRead(() => handleGetAvatars()),
  ]);

  if (gen !== historyFetchGeneration || modelGen !== modelSettingsFetchGeneration) {
    return clone();
  }

  const anyRemote = [
    settings,
    prompt,
    activation,
    configModels,
    availableModels,
    history,
    domains,
    embeddingStatus,
    avatars,
  ].some((value) => value != null);

  if (anyRemote) {
    applyRemoteSlices({
      settings,
      prompt,
      activation,
      configModels,
      availableModels,
      history: Array.isArray(history) ? history : undefined,
      domains,
      embeddingStatus,
      avatars,
    });
    syncIntegrationScripts(projectId);
    return clone();
  }

  await delay(LATENCY_MS);
  syncIntegrationScripts(projectId);
  return clone();
}

export async function refreshSettingsSection(section: SettingsSection): Promise<ChatbotConfigBundle> {
  const params = projectParams();
  switch (section) {
    case 'overview': {
      const [settings, configModels, domains] = await Promise.all([
        tryRead(() => handleGetChatbotSettings(params)),
        tryRead(() => handleGetConfigModels(params)),
        loadDomainsRemote(),
      ]);
      applyRemoteSlices({ settings, configModels, domains });
      return clone();
    }
    case 'model': {
      const [configModels, availableModels] = await Promise.all([
        tryRead(() => handleGetConfigModels(params)),
        tryRead(() => handleGetConfigModelsCatalog()),
      ]);
      applyRemoteSlices({ configModels, availableModels });
      return clone();
    }
    case 'domains': {
      const domains = await loadDomainsRemote();
      applyRemoteSlices({ domains });
      return clone();
    }
    case 'widget-config':
    case 'feedback':
    case 'privacy': {
      const settings = await tryRead(() => handleGetChatbotSettings(params));
      applyRemoteSlices({ settings });
      return clone();
    }
    case 'widget-customization': {
      const [settings, avatars] = await Promise.all([
        tryRead(() => handleGetChatbotSettings(params)),
        tryRead(() => handleGetAvatars()),
      ]);
      applyRemoteSlices({ settings, avatars });
      return clone();
    }
    default:
      syncIntegrationScripts(activeProjectId);
      return clone();
  }
}

export async function refreshChatHistory(): Promise<ChatbotConfigBundle> {
  const gen = historyFetchGeneration;
  const history = await tryRead(() => handleGetChatHistory({ limit: 200, offset: 0, ...projectParams() }));
  if (gen !== historyFetchGeneration) {
    return clone();
  }
  if (Array.isArray(history)) historyRows = history;
  return clone();
}

export async function exportChatbotHistory(fmt: 'csv' | 'json', query?: string): Promise<string> {
  return handleExportChatHistory({
    fmt,
    q: query?.trim() || undefined,
    maxRows: 10_000,
    ...projectParams(),
  });
}

export type ModelSettingsSaveOptions = {
  pendingPlaintextApiKey?: string | null;
  apiKeyEditing?: boolean;
};

export async function saveModelSettings(
  settings: ModelSettings,
  options?: ModelSettingsSaveOptions,
): Promise<ChatbotConfigBundle> {
  const params = projectParams();
  const hasSavedKey = hasUsableSavedApiKeyForProvider({
    apiKeyMasked: state.modelSettings.apiKeyMasked,
    savedProvider: state.modelSettings.provider,
    draftProvider: settings.provider,
    providerApiKeys: state.modelSettings.providerApiKeys,
  });
  const availableEmbeddingKeys = resolveEmbeddingModelOptions(settings.provider, state.availableModels).map(
    (m) => m.key,
  );
  const finalEmbeddingModel = resolveEmbeddingModelForSave(settings.embeddingModel, availableEmbeddingKeys);

  const { apiKeyToSave, error: keyError } = resolveApiKeyForPersist({
    draftKey: settings.apiKey,
    pendingPlaintextKey: options?.pendingPlaintextApiKey,
    hasSavedKey,
    provider: settings.provider,
    apiKeyEditing: options?.apiKeyEditing,
  });
  if (keyError) throw new Error(keyError);

  const body = mapSettingsToConfigModelsUpdate({
    ...settings,
    embeddingModel: finalEmbeddingModel,
    apiKey: apiKeyToSave ?? '',
  });
  if (!apiKeyToSave) delete body.api_key;

  await requireWrite('Save model settings', () => handleSaveConfigModels(body, params));

  const refreshed = await tryRead(() => handleGetConfigModels(params));
  const parsed = refreshed ? parseConfigModelsBody(refreshed) : null;
  if (parsed) {
    const mapped = mapConfigModelsToSettings(parsed, state.modelSettings);
    const mask =
      mapped.apiKeyMasked?.trim() || (apiKeyToSave ? toApiKeyPresenceMarker(apiKeyToSave) : '');
    state.modelSettings = {
      ...mapped,
      embeddingModel: finalEmbeddingModel,
      apiKey: mask ? formatApiKeyFieldDisplay(mask) : '',
      apiKeyMasked: mask,
      providerApiKeys: mapped.providerApiKeys ?? {},
    };
  } else {
    const mask = apiKeyToSave ? toApiKeyPresenceMarker(apiKeyToSave) : '';
    const family = normalizeProviderApiKeyFamily(settings.provider);
    state.modelSettings = {
      ...settings,
      embeddingModel: finalEmbeddingModel,
      apiKey: mask ? formatApiKeyFieldDisplay(mask) : '',
      apiKeyMasked: mask,
      providerApiKeys: {
        ...(settings.providerApiKeys ?? {}),
        ...(mask && family ? { [family]: mask } : {}),
      },
    };
  }

  if (state.modelStatus) {
    state.modelStatus = {
      ...state.modelStatus,
      needsReindex: finalEmbeddingModel !== state.modelStatus.activeModel,
    };
  }

  return clone();
}

export type ModelConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

export type ModelConnectionTestOptions = {
  hasSavedApiKey?: boolean;
  pendingPlaintextApiKey?: string | null;
};

export async function testModelConnection(
  settings: Pick<ModelSettings, 'provider' | 'chatModel' | 'embeddingModel' | 'apiKey'>,
  options?: ModelConnectionTestOptions,
): Promise<ModelConnectionTestResult> {
  const params = projectParams();
  const hasSavedKey =
    options?.hasSavedApiKey ??
    hasUsableSavedApiKeyForProvider({
      apiKeyMasked: state.modelSettings.apiKeyMasked,
      savedProvider: state.modelSettings.provider,
      draftProvider: settings.provider,
      providerApiKeys: state.modelSettings.providerApiKeys,
    });
  const { apiKey: resolvedKey, useStored } = resolveApiKeyForConnectionTest({
    draftKey: settings.apiKey ?? '',
    pendingPlaintextKey: options?.pendingPlaintextApiKey,
  });

  if (useStored && !hasSavedKey) {
    return { ok: false, message: 'Enter an API key to test the connection.' };
  }
  if (!settings.chatModel?.trim()) {
    return { ok: false, message: 'Select a chat model before testing.' };
  }

  const body: Record<string, unknown> = {
    provider: settings.provider,
    api_key: useStored ? '' : resolvedKey,
    chat_model: settings.chatModel,
    embedding_model: settings.embeddingModel || undefined,
  };
  if (useStored) {
    body.use_stored_key = true;
  }

  const started = Date.now();
  try {
    const response = await handleTestConfigModels(body, params);
    const envelope =
      response && typeof response === 'object'
        ? ((response as Record<string, unknown>).data ?? response)
        : response;
    const data =
      envelope && typeof envelope === 'object' ? (envelope as Record<string, unknown>) : null;

    if (data) {
      const outcome = formatSplitConnectionTestResult(
        {
          chat_model: asString(data.chat_model),
          embedding_model: asString(data.embedding_model),
        },
        { embeddingModel: settings.embeddingModel },
      );
      return {
        ok: outcome.ok,
        message: outcome.message,
        latencyMs: Date.now() - started,
      };
    }

    return {
      ok: false,
      message: 'Invalid test connection response.',
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      message: formatConnectionTestError(err instanceof Error ? err.message : 'Connection failed.'),
      latencyMs: Date.now() - started,
    };
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export async function refreshModelStatus(): Promise<ChatbotConfigBundle> {
  const projectId = activeProjectId;
  if (!projectId) return clone();
  const raw = await tryRead(() => handleGetProjectEmbeddingStatus(projectId, 'chat'));
  const parsed = raw ? parseEmbeddingStatus(raw) : null;
  if (parsed) state.modelStatus = mapEmbeddingStatusToChatbotModelStatus(parsed);
  return clone();
}

export async function saveActiveConfig(patch: Partial<ActiveTrainingConfig>): Promise<ChatbotConfigBundle> {
  const params = projectParams();
  if (patch.chatbotActive !== undefined) {
    await requireWrite('Update chatbot activation', () =>
      handleUpdateChatbotActivation(patch.chatbotActive!, params),
    );
    state.chatbotActive = patch.chatbotActive;
  }
  if (patch.systemPrompt !== undefined) {
    await saveSystemPrompt(patch.systemPrompt);
  }
  return clone();
}

export async function saveSystemPrompt(systemPrompt: string): Promise<ChatbotConfigBundle> {
  const trimmed = systemPrompt.trim();
  await requireWrite('Save system prompt', () =>
    handleSaveChatPrompt(toChatbotPromptUpdateRequest(trimmed)),
  );
  state.systemPrompt = trimmed;
  state.systemPromptIsDefault = false;
  state.modelSettings = { ...state.modelSettings, systemPrompt: trimmed };
  return clone();
}

export async function addAllowedDomain(domain: string, scope: DomainScope = 'entire-site'): Promise<ChatbotConfigBundle> {
  const rule = buildAllowedUrlRuleFromInput(domain, scope);
  if (!rule) throw new Error('errors.domains.invalidUrl');
  const domainString = allowedUrlRuleToDomainString(rule);
  const ruleKey = allowedDomainRuleKey(rule);
  if (
    state.allowedDomains.some((entry) => {
      const existing = ruleFromAllowedDomainEntry(entry.domain, entry.scope);
      return existing != null && allowedDomainRuleKey(existing) === ruleKey;
    })
  ) {
    throw new Error('errors.domains.urlAlreadyAllowlisted');
  }
  domainScopes.set(domainString, scope);
  state.allowedDomains = [
    ...state.allowedDomains,
    {
      id: `dom_${Date.now()}`,
      domain: domainString,
      scope,
      addedAt: new Date().toISOString(),
    },
  ];
  await persistDomains();
  return clone();
}

export async function removeAllowedDomain(id: string): Promise<ChatbotConfigBundle> {
  const removed = state.allowedDomains.find((d) => d.id === id);
  if (removed) domainScopes.delete(removed.domain);
  state.allowedDomains = state.allowedDomains.filter((d) => d.id !== id);
  await persistDomains();
  return clone();
}

export async function saveChatWidgetConfig(config: ChatWidgetConfig): Promise<ChatbotConfigBundle> {
  assertSettingsHydratedForWrite('Save chat widget configuration');
  const params = projectParams();
  const body = mapChatWidgetConfigToApi(config, state.feedbackSettings.collectFeedback);
  const response = await requireWrite('Save chat widget configuration', () =>
    handleSaveChatbotConfiguration(body, params),
  );
  const saved = parseChatbotConfigurationResponse(response);
  state.chatWidgetConfig = saved
    ? mapChatWidgetConfigFromApi(saved, { ...state.chatWidgetConfig, ...config })
    : { ...config };
  return clone();
}

export async function saveChatWidgetCustomization(
  customization: ChatWidgetCustomization,
  config?: ChatWidgetConfig,
): Promise<ChatbotConfigBundle> {
  assertSettingsHydratedForWrite('Save chat widget customization');
  const params = projectParams();
  const effectiveConfig = config ? { ...state.chatWidgetConfig, ...config } : state.chatWidgetConfig;
  const body = mapChatWidgetCustomizationToApi(customization, effectiveConfig);
  const response = await requireWrite('Save chat widget customization', () =>
    handleSaveChatbotCustomization(body, params),
  );
  const saved = parseChatbotCustomizationResponse(response);
  state.chatWidgetCustomization = saved
    ? mapChatWidgetCustomizationFromApi(saved, customization)
    : { ...customization };
  if (config) {
    state.chatWidgetConfig = effectiveConfig;
  }
  return clone();
}

export async function fetchChatWidgetSettings(): Promise<{
  config: ChatWidgetConfig;
  customization: ChatWidgetCustomization;
  chatbotActive: boolean;
  avatarOptions: AvatarOption[];
  collectFeedback: boolean;
  storeHistoryEnabled: boolean;
}> {
  const params = projectParams();
  const [settings, activation, avatars] = await Promise.all([
    tryRead(() => handleGetChatbotSettings(params)),
    tryRead(() => handleGetChatbotActivation(params)),
    tryRead(() => handleGetAvatars()),
  ]);
  if (avatars != null) {
    state.avatarOptions = parseAvatarsResponse(avatars) ?? buildDefaultAvatarOptions();
  }
  const payload = settings ? parseChatbotSettingsPayload(settings) : null;
  if (payload) {
    state.chatWidgetConfig = mapChatWidgetConfigFromApi(
      payload.configuration,
      state.chatWidgetConfig,
      payload.customization,
    );
    state.chatWidgetCustomization = mapChatWidgetCustomizationFromApi(
      payload.customization,
      state.chatWidgetCustomization,
    );
    settingsHydratedFromApi = true;
  }
  if (payload) {
    state.feedbackSettings = mapFeedbackFromConfiguration(payload.configuration, state.feedbackSettings);
    state.privacySettings = mapPrivacyFromConfiguration(payload.configuration, state.privacySettings);
  }
  if (activation != null) {
    const active = parseChatbotActivationStatus(activation);
    if (active != null) state.chatbotActive = active;
  }
  return {
    config: { ...state.chatWidgetConfig },
    customization: { ...state.chatWidgetCustomization },
    chatbotActive: state.chatbotActive,
    avatarOptions: [...state.avatarOptions],
    collectFeedback:
      state.feedbackSettings.collectFeedback && state.privacySettings.storeHistoryEnabled,
    storeHistoryEnabled: state.privacySettings.storeHistoryEnabled,
  };
}

export async function savePrivacySettings(settings: PrivacySettings): Promise<ChatbotConfigBundle> {
  assertSettingsHydratedForWrite('Save privacy settings');
  const params = projectParams();
  const body = mapPrivacySettingsToApi(
    state.chatWidgetConfig,
    settings,
    state.feedbackSettings.collectFeedback,
  );
  const response = await requireWrite('Save privacy settings', () => handleSaveChatbotConfiguration(body, params));
  const saved = parseChatbotConfigurationResponse(response);
  if (saved) {
    state.chatWidgetConfig = mapChatWidgetConfigFromApi(saved, state.chatWidgetConfig);
    state.privacySettings = mapPrivacyFromConfiguration(saved, settings);
    state.feedbackSettings = mapFeedbackFromConfiguration(saved, state.feedbackSettings);
  } else {
    state.privacySettings = { ...settings };
  }
  if (!settings.storeHistoryEnabled) {
    await fetchChatHistory();
  }
  return clone();
}

export async function saveFeedbackSettings(settings: FeedbackSettings): Promise<ChatbotConfigBundle> {
  assertSettingsHydratedForWrite('Save feedback settings');
  const params = projectParams();
  const body = mapChatWidgetConfigToApi(state.chatWidgetConfig, settings.collectFeedback);
  const response = await requireWrite('Save feedback settings', () => handleSaveChatbotConfiguration(body, params));
  const saved = parseChatbotConfigurationResponse(response);
  if (saved) {
    state.chatWidgetConfig = mapChatWidgetConfigFromApi(saved, state.chatWidgetConfig);
  }
  state.feedbackSettings = { ...settings };
  return clone();
}

export async function deleteChatHistory(sessionIds: string[]): Promise<ChatbotConfigBundle> {
  const receiptIds: string[] = [];
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const response = await requireWrite('Delete conversation', () =>
        handleClearChatSession(sessionId, 'page'),
      );
      const receiptId = (response as { data?: { deletion_receipt_id?: string } })?.data
        ?.deletion_receipt_id;
      if (receiptId) receiptIds.push(receiptId);
    }),
  );
  const idSet = new Set(sessionIds);
  historyRows = historyRows.filter((r) => !idSet.has(r.session_id));
  const bundle = clone();
  (bundle as ChatbotConfigBundle & { lastDeletionReceiptId?: string }).lastDeletionReceiptId =
    receiptIds[0];
  return bundle;
}

export async function deleteAllChatHistory(): Promise<ChatbotConfigBundle> {
  await requireWrite('Clear chat history', () => handleDeleteAllChatMessages('page'));
  historyRows = [];
  return clone();
}

/** @deprecated Use deleteAllChatHistory */
export async function clearChatHistory(): Promise<ChatbotConfigBundle> {
  return deleteAllChatHistory();
}

export async function regenerateIntegrationScript(_variant: 'web' | 'mobile'): Promise<ChatbotConfigBundle> {
  syncIntegrationScripts(activeProjectId);
  return clone();
}

export async function fetchProjectEmbeddingStatus(
  projectId: string,
  source: EmbeddingSource = 'chat',
): Promise<EmbeddingStatus | null> {
  const raw = await tryRead(() => handleGetProjectEmbeddingStatus(projectId, source));
  return raw ? parseEmbeddingStatus(raw) : null;
}

export async function startProjectEmbeddingReindex(
  projectId: string,
  source: EmbeddingSource = 'chat',
  options?: { includeCrawled?: boolean; documentIds?: string[] },
) {
  const raw = await tryRead(() => handlePostProjectReindex(projectId, source, options));
  return raw ? parseReindexProgress(raw) : null;
}

export async function fetchProjectReindexProgress(projectId: string, source: EmbeddingSource = 'chat') {
  const raw = await tryRead(() => handleGetProjectReindexProgress(projectId, source));
  return raw ? parseReindexProgress(raw) : null;
}
