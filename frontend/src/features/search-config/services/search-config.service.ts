import type {
  EmbeddingSource,
  EmbeddingStatus,
  ReindexOptions,
  ReindexProgress,
} from "@/features/search-config/types/embedding.types";
import type {
  CompareSearchRequest,
  ModelConfigProfileCreate,
  ModelConfigProfileUpdate,
  RagQueryRequest,
} from "@/features/search-config/types/search-api.types";
import type {
  AllowedDomain,
  CitationFormat,
  DomainScope,
  ModelSettings,
  PredefinedQuestionsSettings,
  SearchBoxConfig,
  SearchBoxCustomization,
  SearchConfigBundle,
  SearchHistoryEntry,
  SearchTestResult,
  SettingsSection,
} from "@/features/search-config/types/search-config.types";
import {
  allowedDomainRuleKey,
  allowedUrlRuleToDomainString,
  buildAllowedUrlRuleFromInput,
  ruleFromAllowedDomainEntry,
} from "@/features/search-config/utils/allowed-url-rules";
import {
  formatModelProviderLabel,
  getChatModelsForProvider,
  resolveEmbeddingModelOptions,
} from "@/features/search-config/utils/model-settings-options";
import {
  buildIntegrationsEmbedPayload,
  buildModelLabel,
  mapCitationApiToFormat,
  mapCitationFormatToApiUpdate,
  mapEmbeddingStatusToModelStatus,
  mapModelSettingsToSearchModelConfigUpdate,
  mapModelStatusFromRag,
  mapRagSettingsToModelFields,
  mapRagSettingsToTrainingOverview,
  mapSearchActivationStatus,
  mapSearchBoxConfigToApiUpdate,
  mapSearchConfigurationApi,
  mapSearchCustomizationApi,
  mapSearchCustomizationToApiUpdate,
  mapSearchModelConfigToSettings,
  mapSearchQueryResponse,
  mapSearchResponseConfigApi,
  mapWidgetDomainsToAllowedDomains,
  parseAvailableSearchModels,
  parseEmbeddingStatus,
  parseIntegrationsEmbedResponse,
  parseReindexProgress,
  parseSearchHistoryRowsResponse,
  parseSearchModelConfigBody,
  parseSearchPromptResponse,
  toPromptUpdateRequest,
  type IntegrationsEmbedCache,
} from "@/features/search-config/utils/search-api-mappers";
import {
  buildSearchMobileIntegrationSnippet,
  buildSearchWebIntegrationSnippet,
  normalizeSearchEmbedApiEndpoint,
} from "@/features/search-config/utils/search-integration-snippets";
import { buildIntegrationCredentials } from '@/shared/utils/integration-credentials';
import {
  formatConnectionTestError,
  hasUsableSavedApiKeyForProvider,
  parseConnectionTestResult,
  resolveApiKeyForModelSave,
  resolveEmbeddingModelForSave,
  shouldUseStoredKeyForConnectionTest,
  validateMaxTokensForResponseType,
} from "@/features/search-config/utils/search-model-settings";
import {
  isSavedApiKeyMarker,
  toApiKeyPresenceMarker,
} from "@/features/search-config/utils/search-settings-api";
import {
  buildSearchStreamRequestBody,
  consumeSearchStream,
} from "@/features/search-config/utils/search-stream";
import type { SearchTestFeedbackPayload } from "@/features/search-config/utils/search-test-feedback-options";
import { findPredefinedSearchAnswer } from "@/features/search-config/utils/search-test-options";
import {
  handleGetProjectEmbeddingStatus,
  handleGetProjectReindexProgress,
  handlePostProjectReindex,
} from "@/network/actions/embedding.actions";
import {
  handleActivateSearch,
  handleClearSearchSession,
  handleDeleteAllSearchMessages,
  handleDeleteSearchMessage,
  handleDeleteSearchModelProfile,
  handleGetAvailableSearchModels,
  handleGetConfigModelsCatalog,
  handleGetIntegrationsEmbed,
  handleGetRagSettings,
  handleGetSearchActivationStatus,
  handleGetSearchCitation,
  handleGetSearchConfiguration,
  handleGetSearchCustomization,
  handleGetSearchHistory,
  handleGetSearchMessage,
  handleGetSearchModelConfig,
  handleGetSearchPrompt,
  handleGetSearchResponseConfig,
  handleGetSearchSessions,
  handleListSearchModelProfiles,
  handlePostSearch,
  handlePostSearchCompare,
  handlePostSearchCompareStream,
  handlePostSearchQuery,
  handlePostSearchStream,
  handleSubmitSearchFeedback,
  handleTestSearchModelConfig,
  handleUpdateIntegrationsEmbed,
  handleUpdateSearchCitation,
  handleUpdateSearchConfiguration,
  handleUpdateSearchCustomization,
  handleUpdateSearchModelConfig,
  handleUpdateSearchModelProfile,
  handleUpdateSearchResponseConfig,
  handleUpsertSearchModelProfile,
  handleUpsertSearchPrompt,
} from "@/network/actions/search-config.actions";
import { API_CONFIG } from "@/network/apiUrl";
import { brandTokens } from '@/theme/brand-tokens';

const LATENCY_MS = 200;
type ScriptKey = "web" | "mobile";

export const SEARCH_CONFIG_API = {
  prompt: API_CONFIG.SEARCH_PROMPT,
  responseConfig: API_CONFIG.SEARCH_RESPONSE_CONFIG,
  ragSettings: API_CONFIG.RAG_SETTINGS,
  search: API_CONFIG.SEARCH,
  searchQuery: API_CONFIG.SEARCH_QUERY,
  searchStream: API_CONFIG.SEARCH_STREAM,
  searchCompare: API_CONFIG.SEARCH_COMPARE,
  searchCompareStream: API_CONFIG.SEARCH_COMPARE_STREAM,
  history: API_CONFIG.SEARCH_HISTORY,
  sessions: API_CONFIG.SEARCH_SESSIONS,
  feedback: API_CONFIG.SEARCH_FEEDBACK,
  messages: API_CONFIG.SEARCH_MESSAGES,
  activate: API_CONFIG.SEARCH_ACTIVATE,
  models: API_CONFIG.SEARCH_MODELS,
  modelsTest: API_CONFIG.SEARCH_MODELS_TEST,
  modelsAvailable: API_CONFIG.SEARCH_MODELS_AVAILABLE,
  configuration: API_CONFIG.SEARCH_CONFIGURATION,
  customization: API_CONFIG.SEARCH_CUSTOMIZATION,
  modelProfiles: API_CONFIG.SEARCH_MODEL_PROFILES,
  citation: API_CONFIG.SEARCH_CITATION,
  integrationsEmbed: API_CONFIG.INTEGRATIONS_EMBED,
  configModelsCatalog: API_CONFIG.CONFIG_MODELS_CATALOG,
  projectEmbeddingStatus: (id: string) => API_CONFIG.projectEmbeddingStatus(id),
  projectReindex: (id: string) => API_CONFIG.projectReindex(id),
  projectReindexProgress: (id: string) => API_CONFIG.projectReindexProgress(id),
} as const;

let activeProjectId: string | null = null;
let searchTestSessionId: string | null = null;
/** Bumped on project switch so in-flight history fetches cannot rewrite the wrong project. */
let historyFetchGeneration = 0;
const domainScopes = new Map<string, DomainScope>();

function syncIntegrationScripts(projectId?: string | null) {
  const resolvedProjectId =
    projectId ?? activeProjectId ?? "your-project-id-here";
  const stamp = String(Date.now());
  state.integrationScripts = {
    webSnippet: buildSearchWebIntegrationSnippet(stamp, resolvedProjectId),
    mobileSnippet: buildSearchMobileIntegrationSnippet({
      projectId: activeProjectId ?? projectId ?? 'YOUR_PROJECT_ID',
    }),
  };
  state.integrationCredentials = buildIntegrationCredentials(
    activeProjectId ?? projectId ?? null,
    normalizeSearchEmbedApiEndpoint(),
    integrationsEmbedCache,
  );
}

export function configureSearchConfigProject(projectId: string | null) {
  activeProjectId = projectId;
  state.searchHistory = [];
  searchTestSessionId = null;
  historyFetchGeneration += 1;
  syncIntegrationScripts(projectId);
}

function projectParams() {
  return { projectId: activeProjectId };
}

async function tryRead<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function requireWrite<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error('common.saveFailed');
  }
}

let integrationsEmbedCache: IntegrationsEmbedCache = {};

async function loadDomainsRemote(): Promise<IntegrationsEmbedCache | null> {
  const embedRaw = await tryRead(() => handleGetIntegrationsEmbed());
  const embed = embedRaw ? parseIntegrationsEmbedResponse(embedRaw) : null;
  if (embed) {
    integrationsEmbedCache = embed;
    return embed;
  }
  return null;
}

async function loadAvailableModelsRemote(): Promise<unknown> {
  const catalog = await tryRead(() => handleGetConfigModelsCatalog());
  if (catalog != null) return catalog;
  return tryRead(() => handleGetAvailableSearchModels(projectParams()));
}

/** Match reference web: always read latest embed config before POST. */
async function fetchIntegrationsEmbedFresh(): Promise<IntegrationsEmbedCache> {
  const read = async (): Promise<IntegrationsEmbedCache | null> => {
    const embed = await tryRead(() => handleGetIntegrationsEmbed());
    return embed ? parseIntegrationsEmbedResponse(embed) : null;
  };

  const first = await read();
  if (first) {
    integrationsEmbedCache = first;
    return first;
  }

  const retry = await read();
  if (retry) {
    integrationsEmbedCache = retry;
    return retry;
  }

  return integrationsEmbedCache ?? {};
}

async function persistSearchDomains(): Promise<void> {
  const current = await fetchIntegrationsEmbedFresh();
  const embedPayload = buildIntegrationsEmbedPayload(state.allowedDomains, current);
  const saved = await requireWrite("Save allowed domains", () =>
    handleUpdateIntegrationsEmbed(embedPayload),
  );
  const parsed = parseIntegrationsEmbedResponse(saved);
  if (!parsed) throw new Error('errors.api.saveAllowedDomainsFailed');
  integrationsEmbedCache = parsed;
}

let state: SearchConfigBundle = {
  trainingOverview: {
    indexedDocuments: 0,
    lastTrainedAt: null,
    activeConfigName: "Search Configuration",
    searchReady: false,
    avgLatencyMs: 0,
  },
  activeConfig: {
    id: "search-config",
    name: "Search Configuration",
    model: "",
    status: "draft",
    updatedAt: new Date().toISOString(),
    documentCount: 0,
    embeddingModel: "",
  },
  searchHistory: [],
  settingsOverview: {
    modelLabel: "Not configured",
    domainCount: 0,
    predefinedCount: 0,
    lastPublishedAt: null,
  },
  modelSettings: {
    provider: "ollama",
    chatModel: "gemma4:31b-cloud",
    embeddingModel: "jina/jina-embeddings-v2-base-de",
    apiKey: "",
    apiKeyMasked: "",
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.01,
    bestOf: 1,
    frequencyPenalty: 0.01,
    presencePenalty: 0.01,
    topKResults: 5,
    similarityThreshold: 0.5,
    useReranker: true,
    systemPrompt: "",
  },
  modelStatus: {
    activeVectors: 0,
    storedEmbeddingModel: "jina/jina-embeddings-v2-base-de",
    needsReindex: false,
  },
  allowedDomains: [],
  citationFormat: {
    citationStyle: "detailed",
    layout: "vertical",
    numberingStyle: "square",
    colorScheme: "default",
    showSnippets: true,
    showUrls: true,
    showSourceCount: true,
    enableHoverEffects: false,
    maxSnippetLength: 150,
  },
  searchBoxConfig: {
    title: "Search",
    language: "en-us",
    style: "customise",
    searchIcon: "search",
    loader: "skeleton",
    backgroundColor: brandTokens.color.hairline,
    borderRadius: "semi-rounded",
    collectUserFeedback: true,
    resultStyle: "list",
  },
  searchBoxCustomization: {
    searchFormType: "with-button",
    buttonType: "search-icon",
    searchButtonText: "Search",
    searchInputPlaceholder: "Search using AI...",
    recentSearchEnabled: true,
    recentSearchTitle: "Recent Searches",
    showSpeechInput: true,
    showSpeechOutput: true,
  },
  predefinedQuestions: {
    enabled: false,
    questionLimit: 5,
    questionsPosition: "below-search",
    questions: [],
  },
  integrationScripts: {
    webSnippet: buildSearchWebIntegrationSnippet(),
    mobileSnippet: buildSearchMobileIntegrationSnippet(),
  },
  integrationCredentials: buildIntegrationCredentials(
    null,
    normalizeSearchEmbedApiEndpoint(),
    null,
  ),
  searchResponseConfig: { responseType: "long" },
  availableModels: null,
};

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clone(): SearchConfigBundle {
  return JSON.parse(JSON.stringify(state)) as SearchConfigBundle;
}

function syncOverview() {
  const chatLabel =
    getChatModelsForProvider(state.modelSettings.provider).find(
      (m) => m.key === state.modelSettings.chatModel,
    )?.label ?? state.modelSettings.chatModel;
  state.settingsOverview = {
    modelLabel: `${formatModelProviderLabel(state.modelSettings.provider)} · ${chatLabel}`,
    domainCount: state.allowedDomains.length,
    predefinedCount: state.predefinedQuestions.enabled
      ? state.predefinedQuestions.questions.length
      : 0,
    lastPublishedAt: state.trainingOverview.lastTrainedAt,
  };
  state.trainingOverview.activeConfigName =
    state.searchBoxConfig.title.trim() || "Search Configuration";
  state.activeConfig.name = state.trainingOverview.activeConfigName;
  state.activeConfig.model = state.modelSettings.chatModel;
  state.activeConfig.embeddingModel = state.modelSettings.embeddingModel;
}

function applyRemoteSlices(slices: {
  activation?: unknown;
  modelConfig?: unknown;
  ragSettings?: unknown;
  configuration?: unknown;
  customization?: unknown;
  citation?: unknown;
  prompt?: unknown;
  responseConfig?: unknown;
  history?: SearchHistoryEntry[] | null;
  domains?: unknown;
  availableModels?: unknown;
}) {
  if (slices.activation != null) {
    const active = mapSearchActivationStatus(slices.activation);
    if (active != null) {
      state.trainingOverview.searchReady = active;
      state.activeConfig.status = active ? "active" : "draft";
    }
  }

  if (slices.modelConfig != null) {
    const parsedBody = parseSearchModelConfigBody(slices.modelConfig);
    const mapped = mapSearchModelConfigToSettings(
      parsedBody,
      state.modelSettings,
    );
    if (mapped) {
      const preservedPrompt = state.modelSettings.systemPrompt;
      state.modelSettings = { ...mapped, systemPrompt: preservedPrompt };
    }
  }

  if (slices.ragSettings != null) {
    const ragFields = mapRagSettingsToModelFields(
      slices.ragSettings,
      state.modelSettings,
    );
    if (ragFields)
      state.modelSettings = { ...state.modelSettings, ...ragFields };
    const overview = mapRagSettingsToTrainingOverview(
      slices.ragSettings,
      state.trainingOverview,
    );
    if (overview)
      state.trainingOverview = { ...state.trainingOverview, ...overview };
    const status = mapModelStatusFromRag(
      slices.ragSettings,
      state.modelSettings.embeddingModel,
    );
    if (status) {
      state.modelStatus = status;
      state.activeConfig.documentCount = status.activeVectors;
    }
  }

  if (slices.prompt != null) {
    const prompt = parseSearchPromptResponse(slices.prompt);
    if (prompt != null) state.modelSettings.systemPrompt = prompt;
  }

  if (slices.responseConfig != null) {
    const mapped = mapSearchResponseConfigApi(
      slices.responseConfig,
      state.searchResponseConfig,
    );
    if (mapped) {
      state.searchResponseConfig = mapped;
      if (
        mapped.responseType === "long" &&
        state.modelSettings.maxTokens < 1200
      ) {
        state.modelSettings.maxTokens = 2048;
      } else if (
        mapped.responseType === "short" &&
        state.modelSettings.maxTokens >= 1200
      ) {
        state.modelSettings.maxTokens = 768;
      }
    }
  }

  if (slices.configuration != null) {
    const mapped = mapSearchConfigurationApi(
      slices.configuration,
      state.searchBoxConfig,
    );
    if (mapped) state.searchBoxConfig = mapped;
  }

  if (slices.customization != null) {
    const mapped = mapSearchCustomizationApi(
      slices.customization,
      state.searchBoxCustomization,
      state.predefinedQuestions,
    );
    if (mapped) {
      state.searchBoxCustomization = mapped.customization;
      state.predefinedQuestions = mapped.predefined;
    }
  }

  if (slices.citation != null) {
    const mapped = mapCitationApiToFormat(
      slices.citation,
      state.citationFormat,
    );
    if (mapped) state.citationFormat = mapped;
  }

  // Empty [] is valid — must replace prior project's recent questions / history.
  if (Array.isArray(slices.history)) {
    state.searchHistory = slices.history;
  }

  if (slices.domains != null && typeof slices.domains === "object") {
    const embed = slices.domains as IntegrationsEmbedCache;
    integrationsEmbedCache = embed;
    if (Array.isArray(embed.search_domains)) {
      state.allowedDomains = mapWidgetDomainsToAllowedDomains(
        embed,
        domainScopes,
      );
    }
  }

  if (slices.availableModels != null) {
    const parsed = parseAvailableSearchModels(slices.availableModels);
    if (parsed) state.availableModels = parsed;
  }

  state.activeConfig.updatedAt = new Date().toISOString();
  syncOverview();
}

export async function fetchSearchHistory(
  limit = 50,
): Promise<SearchHistoryEntry[]> {
  const gen = historyFetchGeneration;
  const rows = await tryRead(() =>
    handleGetSearchHistory({ ...projectParams(), limit, source: "page" }),
  );
  if (gen !== historyFetchGeneration) {
    return [...state.searchHistory];
  }
  if (Array.isArray(rows)) {
    state.searchHistory = rows;
    return rows;
  }
  await delay(LATENCY_MS);
  return [...state.searchHistory];
}

export async function fetchWidgetDomains(): Promise<AllowedDomain[]> {
  const remote = await loadDomainsRemote();
  if (remote) {
    state.allowedDomains = mapWidgetDomainsToAllowedDomains(
      remote,
      domainScopes,
    );
    syncOverview();
    return state.allowedDomains;
  }
  await delay(LATENCY_MS);
  return [...state.allowedDomains];
}

export async function fetchSearchConfigBundle(): Promise<SearchConfigBundle> {
  const params = projectParams();
  const gen = historyFetchGeneration;
  const [
    activation,
    modelConfig,
    ragSettings,
    configuration,
    customization,
    citation,
    prompt,
    responseConfig,
    history,
    domains,
    availableModels,
  ] = await Promise.all([
    tryRead(() => handleGetSearchActivationStatus(params)),
    tryRead(() => handleGetSearchModelConfig(params)),
    tryRead(() => handleGetRagSettings(params)),
    tryRead(() => handleGetSearchConfiguration(params)),
    tryRead(() => handleGetSearchCustomization(params)),
    tryRead(() => handleGetSearchCitation(params)),
    tryRead(() => handleGetSearchPrompt()),
    tryRead(() => handleGetSearchResponseConfig(params)),
    tryRead(() =>
      handleGetSearchHistory({ ...params, limit: 50, source: "page" }),
    ),
    loadDomainsRemote(),
    loadAvailableModelsRemote(),
  ]);

  if (gen !== historyFetchGeneration) {
    return clone();
  }

  const anyRemote = [
    activation,
    modelConfig,
    ragSettings,
    configuration,
    customization,
    citation,
    prompt,
    responseConfig,
    history,
    domains,
    availableModels,
  ].some((value) => value != null);

  if (anyRemote) {
    applyRemoteSlices({
      activation,
      modelConfig,
      ragSettings,
      configuration,
      customization,
      citation,
      prompt,
      responseConfig,
      history: Array.isArray(history) ? history : undefined,
      domains,
      availableModels,
    });
    syncIntegrationScripts(activeProjectId);
    return clone();
  }

  await delay(LATENCY_MS);
  syncOverview();
  syncIntegrationScripts(activeProjectId);
  return clone();
}

export async function refreshSettingsOverview(): Promise<SearchConfigBundle> {
  const params = projectParams();
  const [modelConfig, citation, configuration, customization, domains] =
    await Promise.all([
      tryRead(() => handleGetSearchModelConfig(params)),
      tryRead(() => handleGetSearchCitation(params)),
      tryRead(() => handleGetSearchConfiguration(params)),
      tryRead(() => handleGetSearchCustomization(params)),
      loadDomainsRemote(),
    ]);

  applyRemoteSlices({
    modelConfig,
    citation,
    configuration,
    customization,
    domains,
  });
  return clone();
}

export async function refreshSettingsSection(
  section: SettingsSection,
): Promise<SearchConfigBundle> {
  const params = projectParams();

  switch (section) {
    case "overview":
      return refreshSettingsOverview();
    case "model": {
      const [modelConfig, availableModels] = await Promise.all([
        tryRead(() => handleGetSearchModelConfig(params)),
        loadAvailableModelsRemote(),
      ]);
      applyRemoteSlices({ modelConfig, availableModels });
      return clone();
    }
    case "domains": {
      const domains = await loadDomainsRemote();
      applyRemoteSlices({ domains });
      return clone();
    }
    case "citation": {
      const citation = await tryRead(() => handleGetSearchCitation(params));
      applyRemoteSlices({ citation });
      return clone();
    }
    case "search-box": {
      const configuration = await tryRead(() =>
        handleGetSearchConfiguration(params),
      );
      applyRemoteSlices({ configuration });
      return clone();
    }
    case "search-customization":
    case "predefined": {
      const customization = await tryRead(() =>
        handleGetSearchCustomization(params),
      );
      applyRemoteSlices({ customization });
      return clone();
    }
    case "integrations":
    case "search-test":
    default:
      syncIntegrationScripts(activeProjectId);
      return clone();
  }
}

export async function saveModelSettings(
  settings: ModelSettings,
): Promise<SearchConfigBundle> {
  const params = projectParams();
  const hasSavedKey = isSavedApiKeyMarker(state.modelSettings.apiKeyMasked);
  const maxTokensError = validateMaxTokensForResponseType(
    settings.maxTokens,
    state.searchResponseConfig.responseType,
  );
  if (maxTokensError) throw new Error(maxTokensError);

  const availableEmbeddingKeys = resolveEmbeddingModelOptions(
    settings.provider,
    state.availableModels,
  ).map((m) => m.key);
  const finalEmbeddingModel = resolveEmbeddingModelForSave(
    settings.embeddingModel,
    availableEmbeddingKeys,
  );

  const { apiKeyToSave, error: keyError } = resolveApiKeyForModelSave(
    settings.apiKey,
    hasSavedKey,
    settings.provider,
  );
  if (keyError) throw new Error(keyError);

  const settingsForSave: ModelSettings = {
    ...settings,
    embeddingModel: finalEmbeddingModel,
    apiKey: apiKeyToSave ?? "",
  };
  const body = mapModelSettingsToSearchModelConfigUpdate(
    settingsForSave,
    state.searchResponseConfig.responseType,
  );
  if (!apiKeyToSave) {
    delete body.api_key;
  }

  await requireWrite("Save model settings", () =>
    handleUpdateSearchModelConfig(body, params),
  );

  const refreshedRaw = await tryRead(() => handleGetSearchModelConfig(params));
  const refreshed =
    refreshedRaw != null ? parseSearchModelConfigBody(refreshedRaw) : null;
  if (refreshed != null) {
    const mapped = mapSearchModelConfigToSettings(
      refreshed,
      state.modelSettings,
    );
    if (mapped) {
      state.modelSettings = {
        ...mapped,
        embeddingModel: finalEmbeddingModel,
        apiKey: "",
        apiKeyMasked:
          mapped.apiKeyMasked?.trim() ||
          (apiKeyToSave ? toApiKeyPresenceMarker(apiKeyToSave) : "") ||
          state.modelSettings.apiKeyMasked,
        systemPrompt: state.modelSettings.systemPrompt,
      };
    }
  } else {
    state.modelSettings = {
      ...settings,
      embeddingModel: finalEmbeddingModel,
      apiKey: "",
      apiKeyMasked: apiKeyToSave
        ? toApiKeyPresenceMarker(apiKeyToSave)
        : state.modelSettings.apiKeyMasked,
    };
  }
  state.modelStatus = {
    ...state.modelStatus,
    needsReindex:
      finalEmbeddingModel !== state.modelStatus.storedEmbeddingModel,
  };
  syncOverview();
  return clone();
}

export type SearchModelConnectionTestResult = {
  ok: boolean;
  message: string;
  latencyMs?: number;
};

export async function testSearchModelConnection(
  settings: Pick<
    ModelSettings,
    "provider" | "chatModel" | "embeddingModel" | "apiKey"
  >,
  options?: { hasSavedApiKey?: boolean },
): Promise<SearchModelConnectionTestResult> {
  const hasSavedKey =
    options?.hasSavedApiKey ??
    hasUsableSavedApiKeyForProvider({
      apiKeyMasked: state.modelSettings.apiKeyMasked,
      savedProvider: state.modelSettings.provider,
      draftProvider: settings.provider,
    });
  const trimmedKey = settings.apiKey.trim();
  const useStoredKey = shouldUseStoredKeyForConnectionTest(settings.apiKey);

  if (useStoredKey && !hasSavedKey) {
    return { ok: false, message: "Enter an API key to test the connection." };
  }
  if (!settings.chatModel?.trim()) {
    return { ok: false, message: "Select a chat model before testing." };
  }

  const remote = await requireWrite("Test model connection", () =>
    handleTestSearchModelConfig(
      {
        provider: settings.provider,
        api_key: useStoredKey ? "" : trimmedKey,
        chat_model: settings.chatModel,
        embedding_model: settings.embeddingModel || undefined,
      },
      projectParams(),
    ),
  );

  const envelope =
    remote && typeof remote === "object"
      ? ((remote as Record<string, unknown>).data ?? remote)
      : remote;
  const data =
    envelope && typeof envelope === "object"
      ? (envelope as Record<string, unknown>)
      : null;

  if (data) {
    const chat = parseConnectionTestResult(
      typeof data.chat_model === "string" ? data.chat_model : undefined,
    );
    if (!chat.ok) {
      return { ok: false, message: formatConnectionTestError(chat.detail) };
    }
    const embed = parseConnectionTestResult(
      typeof data.embedding_model === "string"
        ? data.embedding_model
        : undefined,
    );
    if (settings.embeddingModel && data.embedding_model && !embed.ok) {
      return { ok: false, message: formatConnectionTestError(embed.detail) };
    }
    return { ok: true, message: "Connection successful." };
  }

  return { ok: false, message: "Invalid test connection response." };
}

export async function refreshModelStatus(): Promise<SearchConfigBundle> {
  const projectId = activeProjectId;
  if (projectId) {
    const embeddingStatus = await tryRead(() =>
      handleGetProjectEmbeddingStatus(projectId, "search"),
    );
    if (embeddingStatus) {
      const parsed = parseEmbeddingStatus(embeddingStatus);
      if (parsed) {
        state.modelStatus = mapEmbeddingStatusToModelStatus(parsed);
        state.activeConfig.documentCount = parsed.active_vectors;
        state.trainingOverview.indexedDocuments =
          parsed.total_documents || parsed.coverage_items_total;
        return clone();
      }
    }
  }

  const remote = await tryRead(() => handleGetRagSettings(projectParams()));
  if (remote) {
    const status = mapModelStatusFromRag(
      remote,
      state.modelSettings.embeddingModel,
    );
    if (status) state.modelStatus = status;
    const ragFields = mapRagSettingsToModelFields(remote, state.modelSettings);
    if (ragFields)
      state.modelSettings = { ...state.modelSettings, ...ragFields };
  } else {
    await delay(LATENCY_MS);
    state.modelStatus = {
      ...state.modelStatus,
      storedEmbeddingModel: state.modelSettings.embeddingModel,
      needsReindex: false,
    };
  }
  return clone();
}

export async function saveSearchStatus(
  enabled: boolean,
): Promise<SearchConfigBundle> {
  await requireWrite("Update search status", () =>
    handleActivateSearch(
      { is_active: enabled },
      { ...projectParams(), isActive: enabled },
    ),
  );
  const refreshed = await tryRead(() =>
    handleGetSearchActivationStatus(projectParams()),
  );
  const active =
    refreshed != null ? mapSearchActivationStatus(refreshed) : null;
  const resolved = active ?? enabled;
  state.trainingOverview.searchReady = resolved;
  state.activeConfig.status = resolved ? "active" : "draft";
  state.activeConfig.updatedAt = new Date().toISOString();
  syncOverview();
  return clone();
}

function normalizeAllowedDomainInput(
  domain: string,
  scope: DomainScope,
): string {
  const rule = buildAllowedUrlRuleFromInput(domain, scope);
  if (!rule) return "";
  return allowedUrlRuleToDomainString(rule);
}

export async function addAllowedDomain(
  domain: string,
  scope: DomainScope = "entire-site",
): Promise<SearchConfigBundle> {
  const rule = buildAllowedUrlRuleFromInput(domain, scope);
  if (!rule) throw new Error('errors.domains.invalidUrl');
  const normalized = allowedUrlRuleToDomainString(rule);
  const ruleKey = allowedDomainRuleKey(rule);
  if (
    state.allowedDomains.some((entry) => {
      const existing = ruleFromAllowedDomainEntry(entry.domain, entry.scope);
      return existing != null && allowedDomainRuleKey(existing) === ruleKey;
    })
  )
    throw new Error('errors.domains.alreadyExists');
  domainScopes.set(normalized, scope);
  state.allowedDomains = [
    ...state.allowedDomains,
    {
      id: `dom_${Date.now()}`,
      domain: normalized,
      scope,
      addedAt: new Date().toISOString(),
    },
  ];
  await persistSearchDomains();
  syncOverview();
  return clone();
}

export async function removeAllowedDomain(
  id: string,
): Promise<SearchConfigBundle> {
  const removed = state.allowedDomains.find((d) => d.id === id);
  if (removed) domainScopes.delete(removed.domain);
  state.allowedDomains = state.allowedDomains.filter((d) => d.id !== id);
  await persistSearchDomains();
  syncOverview();
  return clone();
}

export async function saveCitationFormat(
  format: CitationFormat,
): Promise<SearchConfigBundle> {
  await requireWrite("Save citation formatting", () =>
    handleUpdateSearchCitation(
      mapCitationFormatToApiUpdate(format),
      projectParams(),
    ),
  );
  const refreshed = await tryRead(() =>
    handleGetSearchCitation(projectParams()),
  );
  const mapped =
    refreshed != null ? mapCitationApiToFormat(refreshed, format) : null;
  state.citationFormat = mapped ?? { ...format };
  return clone();
}

export async function saveSearchBoxConfig(
  config: SearchBoxConfig,
): Promise<SearchConfigBundle> {
  await requireWrite("Save search configuration", () =>
    handleUpdateSearchConfiguration(
      mapSearchBoxConfigToApiUpdate(config),
      projectParams(),
    ),
  );
  const refreshed = await tryRead(() =>
    handleGetSearchConfiguration(projectParams()),
  );
  const mapped =
    refreshed != null ? mapSearchConfigurationApi(refreshed, config) : null;
  state.searchBoxConfig = mapped ?? { ...config };
  return clone();
}

export async function saveSearchBoxCustomization(
  customization: SearchBoxCustomization,
): Promise<SearchConfigBundle> {
  await requireWrite("Save search customization", () =>
    handleUpdateSearchCustomization(
      mapSearchCustomizationToApiUpdate(
        customization,
        state.predefinedQuestions,
      ),
      projectParams(),
    ),
  );
  const refreshed = await tryRead(() =>
    handleGetSearchCustomization(projectParams()),
  );
  const mapped =
    refreshed != null
      ? mapSearchCustomizationApi(
          refreshed,
          customization,
          state.predefinedQuestions,
        )
      : null;
  if (mapped) {
    state.searchBoxCustomization = mapped.customization;
  } else {
    state.searchBoxCustomization = { ...customization };
  }
  return clone();
}

export async function savePredefinedQuestions(
  settings: PredefinedQuestionsSettings,
): Promise<SearchConfigBundle> {
  const limit = Math.max(1, Math.min(50, settings.questionLimit || 1));
  const normalized: PredefinedQuestionsSettings = {
    enabled: settings.enabled,
    questionLimit: limit,
    questionsPosition: settings.questionsPosition ?? "below-search",
    questions: settings.questions
      .slice(0, limit)
      .map((q, index) => ({ ...q, order: index + 1, text: q.text.trim() }))
      .filter((q) => q.text.length > 0),
  };

  await requireWrite("Save predefined questions", () =>
    handleUpdateSearchCustomization(
      mapSearchCustomizationToApiUpdate(
        state.searchBoxCustomization,
        normalized,
      ),
      projectParams(),
    ),
  );
  const refreshed = await tryRead(() =>
    handleGetSearchCustomization(projectParams()),
  );
  const mapped =
    refreshed != null
      ? mapSearchCustomizationApi(
          refreshed,
          state.searchBoxCustomization,
          normalized,
        )
      : null;
  state.predefinedQuestions = mapped?.predefined ?? normalized;
  syncOverview();
  return clone();
}

function applyResponseTypeToSettings(
  settings: ModelSettings,
  responseType: "long" | "short",
): ModelSettings {
  if (responseType === "long") {
    return {
      ...settings,
      maxTokens: 2048,
      temperature: Math.max(settings.temperature, 0.2),
    };
  }
  return {
    ...settings,
    maxTokens: 768,
    temperature: Math.min(settings.temperature, 0.15),
  };
}

export async function saveSystemPrompt(
  systemPrompt: string,
): Promise<SearchConfigBundle> {
  const trimmed = systemPrompt.trim();
  await requireWrite("Save system prompt", () =>
    handleUpsertSearchPrompt(toPromptUpdateRequest(trimmed)),
  );

  const refreshed = await tryRead(() => handleGetSearchPrompt());
  const parsed =
    refreshed != null ? parseSearchPromptResponse(refreshed) : null;
  state.modelSettings = {
    ...state.modelSettings,
    systemPrompt: parsed ?? trimmed,
  };
  syncOverview();
  return clone();
}

export async function saveSearchResponseConfig(
  responseType: "long" | "short",
): Promise<SearchConfigBundle> {
  const nextSettings = applyResponseTypeToSettings(
    state.modelSettings,
    responseType,
  );
  await requireWrite("Save response configuration", () =>
    handleUpdateSearchResponseConfig({
      response_type: responseType,
      max_tokens: nextSettings.maxTokens,
    }),
  );

  const refreshed = await tryRead(() =>
    handleGetSearchResponseConfig(projectParams()),
  );
  if (refreshed != null) {
    const mapped = mapSearchResponseConfigApi(
      refreshed,
      state.searchResponseConfig,
    );
    if (mapped) {
      state.searchResponseConfig = mapped;
      state.modelSettings = applyResponseTypeToSettings(
        state.modelSettings,
        mapped.responseType,
      );
      syncOverview();
      return clone();
    }
  }

  state.searchResponseConfig = { responseType };
  state.modelSettings = nextSettings;
  syncOverview();
  return clone();
}

export async function refreshSearchHistory(
  limit = 50,
): Promise<SearchConfigBundle> {
  const gen = historyFetchGeneration;
  const rows = await tryRead(() =>
    handleGetSearchHistory({ ...projectParams(), limit, source: "page" }),
  );
  if (gen !== historyFetchGeneration) {
    return clone();
  }
  if (Array.isArray(rows)) state.searchHistory = rows;
  return clone();
}

export async function runSearchTest(
  query: string,
  handlers?: {
    onToken?: (token: string, accumulated: string) => void;
    onSources?: (sources: import('@/features/search-config/types/search-config.types').SearchTestCitation[]) => void;
  },
): Promise<SearchTestResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('errors.search.emptyQuery');
  if (trimmed.length < 3) throw new Error('errors.search.minQueryLength');

  const predefinedAnswer = state.predefinedQuestions.enabled
    ? findPredefinedSearchAnswer(trimmed, state.predefinedQuestions.questions)
    : null;

  if (predefinedAnswer) {
    const sessionId = searchTestSessionId ?? `search_${Date.now()}`;
    searchTestSessionId = sessionId;
    const mapped: SearchTestResult = {
      id: `local_${Date.now()}`,
      sessionId,
      answer: predefinedAnswer,
      citations: [],
      latencyMs: 500,
    };
    if (handlers?.onToken) {
      handlers.onToken(predefinedAnswer, predefinedAnswer);
    }
    appendSearchTestHistory(trimmed, mapped);
    return mapped;
  }

  const streamBody = buildSearchStreamRequestBody({
    query: trimmed,
    topK: state.modelSettings.topKResults,
    similarityThreshold: state.modelSettings.similarityThreshold,
    useReranker: state.modelSettings.useReranker,
    maxTokens: state.modelSettings.maxTokens,
    responseType: state.searchResponseConfig.responseType,
    sessionId: searchTestSessionId ?? undefined,
  });

  const startTime = Date.now();
  let mapped: SearchTestResult | null = null;

  const streamResponse = await tryRead(() =>
    handlePostSearchStream(streamBody, projectParams()),
  );
  if (streamResponse) {
    try {
      const streamed = await consumeSearchStream(streamResponse, {
        onToken: handlers?.onToken,
        onSources: handlers?.onSources,
      });
      // Empty stream payload must not block the non-stream fallback.
      if (streamed.answer?.trim()) {
        mapped = {
          id: streamed.message_id || `msg_${Date.now()}`,
          sessionId: streamed.session_id || searchTestSessionId || undefined,
          answer: streamed.answer,
          citations: streamed.sources,
          latencyMs: Date.now() - startTime,
        };
        if (streamed.session_id) searchTestSessionId = streamed.session_id;
      }
    } catch {
      mapped = null;
    }
  }

  if (!mapped) {
    const body: RagQueryRequest = {
      query: trimmed,
      top_k: state.modelSettings.topKResults,
      use_reranker: state.modelSettings.useReranker,
      similarity_threshold: state.modelSettings.similarityThreshold,
      session_id: searchTestSessionId ?? undefined,
    };

    const remote =
      (await tryRead(() => handlePostSearchQuery(body, projectParams()))) ??
      (await requireWrite("Run search test", () =>
        handlePostSearch(body, projectParams()),
      ));
    mapped = mapSearchQueryResponse(remote, trimmed);
    if (!mapped) throw new Error('errors.search.invalidTestResponse');
    if (mapped.sessionId) searchTestSessionId = mapped.sessionId;
  }

  appendSearchTestHistory(trimmed, mapped);
  return mapped;
}

function appendSearchTestHistory(trimmed: string, mapped: SearchTestResult) {
  const sessionId =
    searchTestSessionId ?? `search_${new Date().toISOString().slice(0, 10)}`;
  const entry: SearchHistoryEntry = {
    id: mapped.id,
    session_id: sessionId,
    message_id: mapped.id,
    user_message: trimmed,
    assistant_response: mapped.answer,
    message_type: "search",
    sources: mapped.citations.length > 0 ? mapped.citations : null,
    feedback: null,
    feedback_rating: null,
    feedback_text: null,
    context_tags: null,
    created_at: new Date().toISOString(),
    execution_snapshot: null,
    feedback_moderation: null,
    latencyMs: mapped.latencyMs,
  };
  state.searchHistory = [entry, ...state.searchHistory].slice(0, 50);
}

export async function submitSearchTestFeedback(
  payload: SearchTestFeedbackPayload,
): Promise<void> {
  const historyEntry = state.searchHistory.find(
    (row) => row.id === payload.resultId || row.message_id === payload.resultId,
  );
  const messageId = historyEntry?.message_id ?? payload.resultId;
  const sessionId = historyEntry?.session_id ?? searchTestSessionId;

  if (!sessionId) {
    throw new Error('errors.search.sessionUnavailable');
  }

  await requireWrite("Submit feedback", () =>
    handleSubmitSearchFeedback(
      {
        session_id: sessionId,
        message_id: messageId,
        feedback: payload.sentiment === "positive",
        rating: payload.rating,
        feedback_text: payload.comments || undefined,
        context_tags: payload.reasons.length > 0 ? payload.reasons : undefined,
      },
      projectParams(),
    ),
  );

  if (historyEntry) {
    historyEntry.feedback = payload.sentiment;
    historyEntry.feedback_rating = payload.rating;
    historyEntry.feedback_text = payload.comments || null;
    historyEntry.context_tags =
      payload.reasons.length > 0 ? payload.reasons : null;
  }
}

export async function clearSearchHistory(): Promise<SearchConfigBundle> {
  await requireWrite("Clear search history", () =>
    handleDeleteAllSearchMessages("page"),
  );
  state.searchHistory = [];
  return clone();
}

export async function deleteSearchHistoryBySessions(
  sessionIds: string[],
): Promise<SearchConfigBundle> {
  const params = { ...projectParams(), source: "page" as const };
  await Promise.all(
    sessionIds.map((sessionId) =>
      requireWrite("Delete search session", () =>
        handleClearSearchSession(sessionId, params),
      ),
    ),
  );
  const idSet = new Set(sessionIds);
  state.searchHistory = state.searchHistory.filter(
    (entry) => !idSet.has(entry.session_id),
  );
  return clone();
}

export async function regenerateIntegrationScript(
  _key: ScriptKey,
): Promise<SearchConfigBundle> {
  syncIntegrationScripts(activeProjectId);
  return clone();
}

// —— Extended API surface (profiles, compare, streaming) ——

export async function fetchAvailableSearchModels(): Promise<unknown> {
  return (await loadAvailableModelsRemote()) ?? null;
}

export async function fetchProjectEmbeddingStatus(
  projectId: string,
  source: EmbeddingSource = "search",
): Promise<EmbeddingStatus | null> {
  const remote = await tryRead(() =>
    handleGetProjectEmbeddingStatus(projectId, source),
  );
  return remote ? parseEmbeddingStatus(remote) : null;
}

export async function startProjectEmbeddingReindex(
  projectId: string,
  source: EmbeddingSource = "search",
  opts?: ReindexOptions,
): Promise<ReindexProgress> {
  const remote = await requireWrite("Start embedding reindex", () =>
    handlePostProjectReindex(projectId, source, opts),
  );
  const parsed = parseReindexProgress(remote);
  if (!parsed) throw new Error('errors.api.invalidReindexResponse');
  return parsed;
}

export async function fetchProjectReindexProgress(
  projectId: string,
  source: EmbeddingSource = "search",
): Promise<ReindexProgress | null> {
  const remote = await tryRead(() =>
    handleGetProjectReindexProgress(projectId, source),
  );
  return remote ? parseReindexProgress(remote) : null;
}

export async function fetchSearchHistoryMessage(
  messageId: string,
): Promise<SearchHistoryEntry | null> {
  const remote = await tryRead(() => handleGetSearchMessage(messageId));
  if (!remote) return null;
  const rows = parseSearchHistoryRowsResponse({ items: [remote] });
  return rows?.[0] ?? null;
}

export async function fetchSearchSessions(): Promise<unknown> {
  return (await tryRead(() => handleGetSearchSessions())) ?? null;
}

export async function listSearchModelProfiles(): Promise<unknown> {
  return (await tryRead(() => handleListSearchModelProfiles())) ?? null;
}

export async function upsertSearchModelProfile(
  body: ModelConfigProfileCreate,
): Promise<unknown> {
  return (await tryRead(() => handleUpsertSearchModelProfile(body))) ?? null;
}

export async function updateSearchModelProfile(
  profileId: string,
  body: ModelConfigProfileUpdate,
): Promise<unknown> {
  return (
    (await tryRead(() => handleUpdateSearchModelProfile(profileId, body))) ??
    null
  );
}

export async function deleteSearchModelProfile(
  profileId: string,
): Promise<unknown> {
  return (
    (await tryRead(() => handleDeleteSearchModelProfile(profileId))) ?? null
  );
}

export async function runSearchCompare(
  body: CompareSearchRequest,
): Promise<unknown> {
  return (await tryRead(() => handlePostSearchCompare(body))) ?? null;
}

export async function runSearchCompareStream(
  body: CompareSearchRequest,
): Promise<Response | null> {
  return tryRead(() => handlePostSearchCompareStream(body));
}

export async function runSearchStream(
  body: RagQueryRequest,
): Promise<Response | null> {
  return tryRead(() => handlePostSearchStream(body, projectParams()));
}

export async function postSearch(body: RagQueryRequest): Promise<unknown> {
  return (await tryRead(() => handlePostSearch(body, projectParams()))) ?? null;
}

export async function deleteSearchMessage(
  messageId: string,
): Promise<SearchConfigBundle> {
  await requireWrite("Delete search message", () =>
    handleDeleteSearchMessage(messageId),
  );
  state.searchHistory = state.searchHistory.filter(
    (row) => row.message_id !== messageId && row.id !== messageId,
  );
  return clone();
}

// Deprecated aliases — use saveSystemPrompt / saveSearchResponseConfig
export async function saveSearchPrompt(systemPrompt: string): Promise<void> {
  await saveSystemPrompt(systemPrompt);
}

export async function updateSearchResponseConfig(
  responseType: "long" | "short",
  maxTokens?: number,
): Promise<void> {
  if (maxTokens != null) {
    state.modelSettings.maxTokens = maxTokens;
  }
  await saveSearchResponseConfig(responseType);
}

export { buildModelLabel };
