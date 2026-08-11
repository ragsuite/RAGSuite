import type {
  AllowedDomain,
  CitationFormat,
  AvailableSearchModels,
  DomainScope,
  ModelProvider,
  ModelSettings,
  ModelStatus,
  PredefinedQuestionsSettings,
  SearchBoxConfig,
  SearchBoxCustomization,
  SearchHistoryEntry,
  SearchResponseConfig,
  SearchTestCitation,
  SearchTestResult,
  TrainingOverview,
} from '@/features/search-config/types/search-config.types';
import type {
  ChatConfigUpdate,
  CitationFormattingUpdate,
  RagSettingsOut,
  SearchActivationStatus,
  SearchConfigurationUpdate,
  SearchCustomizationUpdate,
  SearchModelConfigUpdate,
  SearchQueryResponse,
} from '@/features/search-config/types/search-api.types';
import { formatModelProviderLabel, MODEL_PROVIDER_OPTIONS, normalizeModelProviderKey } from '@/features/search-config/utils/model-settings-options';
import {
  allowedUrlRuleToDomainString,
  buildAllowedUrlRuleFromInput,
  inferDomainScope,
  normalizeAllowedUrlEntries,
  type AllowedUrlEntry,
} from '@/features/search-config/utils/allowed-url-rules';
import {
  fromApiBorderRadius,
  fromApiButtonType,
  fromApiLoaderType,
  fromApiNumberingStyle,
  fromApiSearchFormType,
  fromApiSearchLanguage,
  fromApiStyleOption,
  toApiBorderRadius,
  toApiButtonType,
  toApiLoaderType,
  toApiNumberingStyle,
  toApiSearchFormType,
  toApiSearchLanguage,
  toApiStyleOption,
  resolveApiKeyMaskedPresence,
} from '@/features/search-config/utils/search-settings-api';

const SEARCH_PROMPT_PREFIX = '__SEARCH_PROMPT__';

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

export function unwrapSearchApiData<T>(body: unknown): T | null {
  if (body == null) return null;
  if (typeof body !== 'object') return body as T;
  const record = body as Record<string, unknown>;
  if ('data' in record && record.data != null) return record.data as T;
  return body as T;
}

export function stripSearchPromptPrefix(raw: string): string {
  if (raw.startsWith(SEARCH_PROMPT_PREFIX)) {
    return raw.slice(SEARCH_PROMPT_PREFIX.length).trimStart();
  }
  return raw;
}

export function withSearchPromptPrefix(prompt: string): string {
  const trimmed = prompt.trim();
  if (trimmed.startsWith(SEARCH_PROMPT_PREFIX)) return trimmed;
  return `${SEARCH_PROMPT_PREFIX}${trimmed}`;
}

export function parseSearchPromptResponse(body: unknown): string | null {
  if (typeof body === 'string') {
    return stripSearchPromptPrefix(body);
  }

  const data = unwrapSearchApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;

  const nested =
    asRecord(data.config) ??
    asRecord(data.settings) ??
    asRecord(data.search_prompt) ??
    asRecord(data.prompt_config);

  const welcome =
    asString(data.welcome_message) ??
    asString(data.system_prompt) ??
    asString(data.prompt) ??
    asString(data.search_prompt) ??
    asString(nested?.welcome_message) ??
    asString(nested?.system_prompt) ??
    asString(nested?.prompt);

  if (welcome == null) return null;
  return stripSearchPromptPrefix(welcome);
}

export function toPromptUpdateRequest(systemPrompt: string) {
  const trimmed = systemPrompt.trim();
  const prefixed = withSearchPromptPrefix(trimmed);
  return {
    welcome_message: prefixed,
    prompt: trimmed,
    system_prompt: trimmed,
  };
}

function normalizeProvider(value: string | null): ModelProvider {
  return normalizeModelProviderKey(value);
}

export function parseSearchModelConfigBody(body: unknown): unknown {
  if (body == null) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return null;
    }
  }
  const unwrapped = unwrapSearchApiData(body);
  if (typeof unwrapped === 'string') {
    try {
      return JSON.parse(unwrapped) as unknown;
    } catch {
      return unwrapped;
    }
  }
  return unwrapped ?? body;
}

function resolveApiKeyMaskedFromApi(
  data: Record<string, unknown>,
  current: string,
): string {
  return resolveApiKeyMaskedPresence({
    apiKeyMasked: asString(data.api_key_masked) ?? asString(data.apiKeyMasked),
    apiKey: asString(data.api_key) ?? asString(data.apiKey),
    current,
  });
}

export function mapSearchModelConfigToSettings(
  body: unknown,
  current: ModelSettings,
): ModelSettings | null {
  const data = unwrapSearchApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;

  const provider = normalizeProvider(
    asString(data.model_provider) ??
      asString(data.provider) ??
      asString(data.llm_provider) ??
      current.provider,
  );
  const chatModel =
    asString(data.search_model) ??
    asString(data.model_name) ??
    asString(data.chat_model) ??
    asString(data.model) ??
    current.chatModel;
  const apiKeyMasked = resolveApiKeyMaskedFromApi(data, current.apiKeyMasked);

  const temperature =
    asNumber(data.search_temperature) ??
    asNumber(data.temperature) ??
    asNumber(data.chat_temperature) ??
    current.temperature;
  const topP = asNumber(data.search_top_p) ?? asNumber(data.top_p) ?? asNumber(data.topP) ?? current.topP;
  const bestOf = asNumber(data.search_best_of) ?? asNumber(data.best_of) ?? asNumber(data.bestOf) ?? current.bestOf;
  const frequencyPenalty =
    asNumber(data.search_frequency_penalty) ??
    asNumber(data.frequency_penalty) ??
    asNumber(data.frequencyPenalty) ??
    current.frequencyPenalty;
  const presencePenalty =
    asNumber(data.search_presence_penalty) ??
    asNumber(data.presence_penalty) ??
    asNumber(data.presencePenalty) ??
    current.presencePenalty;
  const topKResults =
    asNumber(data.search_top_k) ?? asNumber(data.top_k) ?? asNumber(data.topK) ?? current.topKResults;
  const similarityThreshold =
    asNumber(data.search_similarity_threshold) ??
    asNumber(data.similarity_threshold) ??
    asNumber(data.similarityThreshold) ??
    current.similarityThreshold;
  const useReranker =
    asBoolean(data.search_use_reranker) ??
    asBoolean(data.use_reranker) ??
    asBoolean(data.useReranker) ??
    current.useReranker;
  const maxTokens =
    asNumber(data.search_max_tokens) ?? asNumber(data.max_tokens) ?? asNumber(data.maxTokens) ?? current.maxTokens;

  return {
    provider,
    chatModel,
    embeddingModel: asString(data.embedding_model) ?? asString(data.embeddingModel) ?? current.embeddingModel,
    apiKey: '',
    apiKeyMasked,
    temperature,
    maxTokens,
    topP,
    bestOf,
    frequencyPenalty,
    presencePenalty,
    topKResults,
    similarityThreshold,
    useReranker,
    systemPrompt: current.systemPrompt,
  };
}

export function mapModelSettingsToSearchModelConfigUpdate(
  settings: ModelSettings,
  responseType: 'long' | 'short',
): SearchModelConfigUpdate {
  const body: SearchModelConfigUpdate = {
    model_provider: settings.provider,
    search_model: settings.chatModel,
    embedding_model: settings.embeddingModel,
    // Reference backend validates these as strings (e.g. "(chatgpt.openai_temperature [string])").
    search_temperature: String(settings.temperature),
    search_top_p: String(settings.topP),
    search_best_of: settings.bestOf,
    search_frequency_penalty: String(settings.frequencyPenalty),
    search_presence_penalty: String(settings.presencePenalty),
    search_top_k: settings.topKResults,
    search_similarity_threshold: settings.similarityThreshold,
    search_max_tokens: settings.maxTokens,
    search_use_reranker: settings.useReranker,
    response_type: responseType,
  };
  if (settings.apiKey.trim()) {
    body.api_key = settings.apiKey.trim();
  }
  return body;
}

export function mapRagSettingsToModelFields(
  body: unknown,
  current: ModelSettings,
): Partial<ModelSettings> | null {
  const data = unwrapSearchApiData<RagSettingsOut>(body) ?? (body as RagSettingsOut);
  if (!data || typeof data !== 'object') return null;
  return {
    topKResults: data.top_k ?? data.topK ?? current.topKResults,
    similarityThreshold: data.similarity_threshold ?? data.similarityThreshold ?? current.similarityThreshold,
    useReranker: data.use_reranker ?? data.useReranker ?? current.useReranker,
    maxTokens: data.max_tokens ?? data.maxTokens ?? current.maxTokens,
  };
}

export function mapRagSettingsToTrainingOverview(body: unknown, current: TrainingOverview): Partial<TrainingOverview> | null {
  const data = asRecord(unwrapSearchApiData(body) ?? body);
  if (!data) return null;
  return {
    indexedDocuments: asNumber(data.total_documents) ?? asNumber(data.indexed_documents) ?? current.indexedDocuments,
    avgLatencyMs: asNumber(data.avg_latency_ms) ?? asNumber(data.avgLatencyMs) ?? current.avgLatencyMs,
    lastTrainedAt: asString(data.last_trained_at) ?? asString(data.lastTrainedAt) ?? current.lastTrainedAt,
  };
}

export function mapSearchActivationStatus(body: unknown): boolean | null {
  const data = unwrapSearchApiData<SearchActivationStatus>(body) ?? (body as SearchActivationStatus);
  if (!data || typeof data !== 'object') return null;
  if (typeof data.is_search_active === 'boolean') return data.is_search_active;
  if (typeof data.is_active === 'boolean') return data.is_active;
  const record = data as Record<string, unknown>;
  const nested = asBoolean(record.is_search_active) ?? asBoolean(record.is_active);
  return nested;
}

export function mapCitationApiToFormat(body: unknown, current: CitationFormat): CitationFormat | null {
  const data = unwrapSearchApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;
  const style = asString(data.citation_style) ?? asString(data.citationStyle);
  const layout = asString(data.layout);
  const numbering = asString(data.numbering_style) ?? asString(data.numberingStyle);
  const colorScheme = asString(data.color_scheme) ?? asString(data.colorScheme);

  return {
    citationStyle: (style as CitationFormat['citationStyle']) ?? current.citationStyle,
    layout: (layout as CitationFormat['layout']) ?? current.layout,
    numberingStyle: fromApiNumberingStyle(numbering) ?? current.numberingStyle,
    colorScheme: (colorScheme as CitationFormat['colorScheme']) ?? current.colorScheme,
    showSnippets: asBoolean(data.show_snippets) ?? asBoolean(data.showSnippets) ?? current.showSnippets,
    showUrls: asBoolean(data.show_urls) ?? asBoolean(data.showUrls) ?? current.showUrls,
    showSourceCount: asBoolean(data.show_source_count) ?? asBoolean(data.showSourceCount) ?? current.showSourceCount,
    enableHoverEffects:
      asBoolean(data.enable_hover_effects) ??
      asBoolean(data.enableHoverEffects) ??
      current.enableHoverEffects,
    maxSnippetLength: asNumber(data.max_snippet_length) ?? asNumber(data.maxSnippetLength) ?? current.maxSnippetLength,
  };
}

export function mapCitationFormatToApiUpdate(format: CitationFormat): CitationFormattingUpdate {
  return {
    citation_style: format.citationStyle,
    layout: format.layout,
    numbering_style: toApiNumberingStyle(format.numberingStyle),
    color_scheme: format.colorScheme,
    show_snippets: format.showSnippets,
    show_urls: format.showUrls,
    show_source_count: format.showSourceCount,
    enable_hover_effects: format.enableHoverEffects,
    max_snippet_length: format.maxSnippetLength,
  };
}

export const DEFAULT_CITATION_FORMAT: CitationFormat = {
  citationStyle: 'detailed',
  layout: 'vertical',
  numberingStyle: 'square',
  colorScheme: 'default',
  showSnippets: true,
  showUrls: true,
  showSourceCount: true,
  enableHoverEffects: false,
  maxSnippetLength: 150,
};

export function mapSearchConfigurationApi(body: unknown, current: SearchBoxConfig): SearchBoxConfig | null {
  const data = unwrapSearchApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;
  return {
    title: asString(data.title) ?? current.title,
    language: fromApiSearchLanguage(asString(data.language)) ?? current.language,
    style: fromApiStyleOption(asString(data.styleOption) ?? asString(data.style)) ?? current.style,
    searchIcon: (asString(data.searchIcon) ?? asString(data.search_icon) ?? current.searchIcon) as SearchBoxConfig['searchIcon'],
    loader: fromApiLoaderType(asString(data.loaderType) ?? asString(data.loader)) ?? current.loader,
    backgroundColor:
      asString(data.background) ?? asString(data.background_color) ?? asString(data.backgroundColor) ?? current.backgroundColor,
    borderRadius:
      fromApiBorderRadius(asString(data.borderRadius) ?? asString(data.border_radius)) ?? current.borderRadius,
    collectUserFeedback:
      asBoolean(data.feedback_enabled) ??
      asBoolean(data.collect_user_feedback) ??
      asBoolean(data.collectUserFeedback) ??
      current.collectUserFeedback,
    resultStyle:
      (asString(data.resultStyle) ?? asString(data.result_style) ?? current.resultStyle ?? 'list') as SearchBoxConfig['resultStyle'],
  };
}

export function mapSearchBoxConfigToApiUpdate(config: SearchBoxConfig): SearchConfigurationUpdate {
  return {
    title: config.title,
    language: toApiSearchLanguage(config.language),
    feedback_enabled: config.collectUserFeedback,
    styleOption: toApiStyleOption(config.style),
    searchIcon: config.searchIcon,
    loaderType: toApiLoaderType(config.loader),
    background: config.backgroundColor,
    borderRadius: toApiBorderRadius(config.borderRadius),
    resultStyle: config.resultStyle ?? 'list',
  };
}

export function mapSearchCustomizationApi(
  body: unknown,
  currentCustomization: SearchBoxCustomization,
  currentPredefined: PredefinedQuestionsSettings,
): { customization: SearchBoxCustomization; predefined: PredefinedQuestionsSettings } | null {
  const data = unwrapSearchApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;

  const customization: SearchBoxCustomization = {
    searchFormType: fromApiSearchFormType(
      asString(data.searchFormType) ?? asString(data.search_form_type),
    ) as SearchBoxCustomization['searchFormType'],
    buttonType: fromApiButtonType(asString(data.buttonType) ?? asString(data.button_type)) as SearchBoxCustomization['buttonType'],
    searchButtonText: asString(data.searchButtonText) ?? asString(data.search_button_text) ?? currentCustomization.searchButtonText,
    searchInputPlaceholder:
      asString(data.searchInputPlaceholder) ??
      asString(data.search_input_placeholder) ??
      currentCustomization.searchInputPlaceholder,
    recentSearchEnabled:
      asBoolean(data.recentSearch) ??
      asBoolean(data.recent_search_enabled) ??
      asBoolean(data.recentSearchEnabled) ??
      currentCustomization.recentSearchEnabled,
    recentSearchTitle:
      asString(data.recentSearchTitle) ?? asString(data.recent_search_title) ?? currentCustomization.recentSearchTitle,
  };

  const rawQuestions = data.questions ?? data.predefined_questions ?? data.predefinedQuestions;
  let questions = currentPredefined.questions;
  if (Array.isArray(rawQuestions)) {
    questions = rawQuestions
      .map((item, index) => {
        const row = asRecord(item);
        const text = asString(row?.text) ?? asString(row?.question) ?? '';
        const answer = asString(row?.answer) ?? asString(row?.response) ?? undefined;
        return {
          id: asString(row?.id) ?? `pq_${index}`,
          text,
          order: asNumber(row?.order) ?? index + 1,
          ...(answer ? { answer } : {}),
        };
      })
      .filter((q) => q.text.length > 0);
  }

  const predefined: PredefinedQuestionsSettings = {
    enabled:
      asBoolean(data.predefinedQuestions) ??
      asBoolean(data.predefined_questions_enabled) ??
      asBoolean(data.predefinedQuestionsEnabled) ??
      currentPredefined.enabled,
    questionLimit:
      asNumber(data.questionsLimit) ??
      asNumber(data.predefined_question_limit) ??
      asNumber(data.predefinedQuestionLimit) ??
      currentPredefined.questionLimit,
    questionsPosition:
      (asString(data.questionsPosition) as PredefinedQuestionsSettings['questionsPosition']) ??
      currentPredefined.questionsPosition ??
      'below-search',
    questions,
  };

  return { customization, predefined };
}

export function mapSearchCustomizationToApiUpdate(
  customization: SearchBoxCustomization,
  predefined?: PredefinedQuestionsSettings,
): SearchCustomizationUpdate {
  const body: SearchCustomizationUpdate = {
    searchFormType: toApiSearchFormType(customization.searchFormType),
    buttonType: toApiButtonType(customization.buttonType),
    searchButtonText: customization.searchButtonText,
    searchInputPlaceholder: customization.searchInputPlaceholder,
    recentSearch: customization.recentSearchEnabled,
    recentSearchTitle: customization.recentSearchTitle,
  };

  if (predefined) {
    body.predefinedQuestions = predefined.enabled;
    body.questionsPosition = predefined.questionsPosition ?? 'below-search';
    body.questionsLimit = predefined.questionLimit;
    body.questions = predefined.questions.map((q) =>
      q.answer?.trim()
        ? { question: q.text, answer: q.answer.trim() }
        : q.text,
    );
  }

  return body;
}

export function mapWidgetDomainsToAllowedDomains(
  payload: { search_domains?: AllowedUrlEntry[]; chatbot_domains?: AllowedUrlEntry[] },
  scopeByDomain: Map<string, DomainScope>,
): AllowedDomain[] {
  const entries = normalizeAllowedUrlEntries((payload.search_domains ?? []) as AllowedUrlEntry[]);
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

export function normalizeSearchHistoryRow(raw: unknown): SearchHistoryEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = asString(record.id) ?? asString(record.message_id);
  const userMessage = asString(record.user_message) ?? asString(record.query);
  if (!id || userMessage == null) return null;

  return {
    id,
    session_id: asString(record.session_id) ?? '',
    message_id: asString(record.message_id) ?? id,
    user_message: userMessage,
    assistant_response: asString(record.assistant_response) ?? asString(record.answer) ?? '',
    message_type: 'search',
    sources: record.sources ?? null,
    feedback: record.feedback ?? null,
    feedback_rating: record.feedback_rating ?? null,
    feedback_text: asString(record.feedback_text),
    context_tags: Array.isArray(record.context_tags)
      ? (record.context_tags.filter((t) => typeof t === 'string') as string[])
      : null,
    created_at: asString(record.created_at) ?? new Date().toISOString(),
    execution_snapshot: record.execution_snapshot ?? null,
    feedback_moderation: record.feedback_moderation ?? null,
    latencyMs: asNumber(record.latency_ms) ?? asNumber(record.history_total_ms) ?? undefined,
    status: asString(record.history_status) === 'failed' ? 'failed' : 'success',
  };
}

export function parseSearchHistoryRowsResponse(body: unknown): SearchHistoryEntry[] | null {
  if (!body) return null;
  let rawRows: unknown[] | null = null;

  if (Array.isArray(body)) {
    rawRows = body;
  } else if (typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const unwrapped = unwrapSearchApiData(record);
    if (Array.isArray(unwrapped)) {
      rawRows = unwrapped;
    } else {
      const items = record.items ?? record.messages ?? record.history ?? record.data ?? record.events;
      if (Array.isArray(items)) rawRows = items;
      else if (record.grouped && typeof record.grouped === 'object') {
        rawRows = Object.values(record.grouped as Record<string, unknown[]>).flat();
      }
    }
  }

  if (!rawRows) return null;
  return rawRows.map(normalizeSearchHistoryRow).filter((row): row is SearchHistoryEntry => row != null);
}

export function mapSearchQueryResponse(body: unknown, query: string): SearchTestResult | null {
  const data = unwrapSearchApiData<SearchQueryResponse>(body) ?? (body as SearchQueryResponse);
  if (!data || typeof data !== 'object') return null;

  const answer = asString(data.answer) ?? asString(data.response) ?? '';
  const messageId = asString(data.message_id) ?? asString(data.id) ?? `msg_${Date.now()}`;
  const sessionId = asString(data.session_id) ?? undefined;
  const latencyMs = asNumber(data.latency_ms) ?? asNumber(data.total_ms) ?? 0;

  const citations: SearchTestCitation[] = [];
  if (Array.isArray(data.sources)) {
    data.sources.forEach((source, index) => {
      const row = asRecord(source);
      if (!row) return;
      citations.push({
        id: asString(row.id) ?? `src_${index}`,
        title: asString(row.title) ?? asString(row.name) ?? 'Source',
        url: asString(row.url) ?? asString(row.link) ?? '',
        excerpt: asString(row.excerpt) ?? asString(row.snippet) ?? asString(row.content) ?? '',
      });
    });
  }

  return {
    id: messageId,
    sessionId,
    answer: answer || `No response for "${query}".`,
    citations,
    latencyMs,
  };
}

export function mapSearchResponseConfigApi(body: unknown, current: SearchResponseConfig): SearchResponseConfig | null {
  const data = unwrapSearchApiData<Record<string, unknown>>(body) ?? asRecord(body);
  if (!data) return null;
  const rawType =
    asString(data.response_type) ??
    asString(data.responseType) ??
    asString(data.type) ??
    asString(asRecord(data.config)?.response_type);
  if (rawType === 'long' || rawType === 'short') {
    return { responseType: rawType };
  }
  const maxTokens = asNumber(data.max_tokens) ?? asNumber(data.maxTokens);
  if (maxTokens != null) {
    return { responseType: maxTokens >= 1200 ? 'long' : 'short' };
  }
  return current;
}

export function parseAvailableSearchModels(body: unknown): AvailableSearchModels | null {
  const data = unwrapSearchApiData(body) ?? body;
  if (!data) return null;

  const providers: AvailableSearchModels['providers'] = [];
  const chatModelsByProvider: Record<string, { key: string; label: string }[]> = {};
  const embeddingModelsByProvider: Record<string, { key: string; label: string }[]> = {};

  const ingestProviderRow = (row: Record<string, unknown>) => {
    const rawKey = (
      asString(row.value) ??
      asString(row.id) ??
      asString(row.key) ??
      asString(row.provider)
    )
      ?.toLowerCase()
      .trim();
    const providerKey = rawKey ? normalizeModelProviderKey(rawKey) : '';
    const label =
      asString(row.provider) ??
      asString(row.name) ??
      asString(row.label) ??
      providerKey;
    if (!providerKey) return;
    if (!providers.some((p) => p.key === providerKey)) {
      providers.push({
        key: providerKey,
        label:
          providerKey === 'ollama' && (!label || label.toLowerCase() === 'ollama')
            ? formatModelProviderLabel(providerKey)
            : (label ?? formatModelProviderLabel(providerKey)),
      });
    }
    const models = row.models ?? row.chat_models;
    if (Array.isArray(models)) {
      chatModelsByProvider[providerKey] = models
        .map((model) => {
          const m = asRecord(model);
          const modelKey =
            asString(m?.value) ??
            asString(m?.id) ??
            asString(m?.key) ??
            asString(m?.model_name) ??
            (typeof model === 'string' ? model : null);
          const modelLabel = asString(m?.name) ?? asString(m?.label) ?? modelKey;
          return modelKey ? { key: modelKey, label: modelLabel ?? modelKey } : null;
        })
        .filter((m): m is { key: string; label: string } => m != null);
    }
    const embeddings = row.embedding_models;
    if (Array.isArray(embeddings)) {
      embeddingModelsByProvider[providerKey] = embeddings
        .map((item) => {
          if (typeof item === 'string') {
            return { key: item, label: item };
          }
          const m = asRecord(item);
          const embedKey =
            asString(m?.value) ??
            asString(m?.id) ??
            asString(m?.key) ??
            asString(m?.model_name);
          const embedLabel = asString(m?.name) ?? asString(m?.label) ?? embedKey;
          return embedKey ? { key: embedKey, label: embedLabel ?? embedKey } : null;
        })
        .filter((m): m is { key: string; label: string } => m != null);
    }
  };

  if (Array.isArray(data)) {
    for (const item of data) {
      const row = asRecord(item);
      if (row) ingestProviderRow(row);
    }
  } else if (typeof data === 'object') {
    const record = data as Record<string, unknown>;
    const providerList = record.providers ?? record.llm_providers ?? record.models;
    if (Array.isArray(providerList)) {
      for (const item of providerList) {
        const row = asRecord(item);
        if (row) ingestProviderRow(row);
      }
    }

    const flatModels = record.chat_models ?? record.models_list;
    if (Array.isArray(flatModels) && Object.keys(chatModelsByProvider).length === 0) {
      chatModelsByProvider.openai = flatModels
        .map((model) => {
          const m = asRecord(model);
          const modelKey = asString(m?.id) ?? asString(m?.key) ?? asString(m?.model_name);
          const modelLabel = asString(m?.name) ?? asString(m?.label) ?? modelKey;
          return modelKey ? { key: modelKey, label: modelLabel ?? modelKey } : null;
        })
        .filter((m): m is { key: string; label: string } => m != null);
    }

    const embeddingList = record.embedding_models ?? record.embeddings;
    if (Array.isArray(embeddingList) && Object.keys(embeddingModelsByProvider).length === 0) {
      embeddingModelsByProvider.openai = embeddingList
        .map((item) => {
          if (typeof item === 'string') return { key: item, label: item };
          const row = asRecord(item);
          const key = asString(row?.id) ?? asString(row?.key) ?? asString(row?.model_name) ?? asString(item);
          const label = asString(row?.name) ?? asString(row?.label) ?? key;
          return key ? { key, label: label ?? key } : null;
        })
        .filter((m): m is { key: string; label: string } => m != null);
    }
  }

  if (
    providers.length === 0 &&
    Object.keys(chatModelsByProvider).length === 0 &&
    Object.keys(embeddingModelsByProvider).length === 0
  ) {
    return null;
  }

  if (chatModelsByProvider['custom-llm'] && !chatModelsByProvider.ollama) {
    chatModelsByProvider.ollama = chatModelsByProvider['custom-llm'];
  }
  if (embeddingModelsByProvider['custom-llm'] && !embeddingModelsByProvider.ollama) {
    embeddingModelsByProvider.ollama = embeddingModelsByProvider['custom-llm'];
  }

  return {
    providers: providers.length > 0 ? providers : MODEL_PROVIDER_OPTIONS.map((p) => ({ key: p.key, label: p.label })),
    chatModelsByProvider,
    embeddingModelsByProvider,
  };
}

export type IntegrationsEmbedCache = {
  publicId?: string;
  keys?: unknown[];
  chatbot_domains?: AllowedUrlEntry[];
  search_domains?: AllowedUrlEntry[];
  domains?: string[];
  embedToken?: string;
};

function parseEmbedDomainEntries(value: unknown): AllowedUrlEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value as AllowedUrlEntry[];
}

export function parseIntegrationsEmbedResponse(body: unknown): IntegrationsEmbedCache | null {
  const data = asRecord(unwrapSearchApiData(body) ?? body);
  if (!data) return null;
  return {
    publicId: asString(data.publicId) ?? asString(data.public_id) ?? undefined,
    keys: Array.isArray(data.keys) ? data.keys : undefined,
    chatbot_domains: parseEmbedDomainEntries(data.chatbot_domains ?? data.chatbotDomains),
    search_domains: parseEmbedDomainEntries(data.search_domains ?? data.searchDomains),
    domains: Array.isArray(data.domains)
      ? (data.domains.filter((d) => typeof d === 'string') as string[])
      : undefined,
    embedToken: asString(data.embed_token) ?? asString(data.embedToken) ?? undefined,
  };
}

export function buildIntegrationsEmbedPayload(
  searchDomains: AllowedDomain[],
  existing: IntegrationsEmbedCache,
): Record<string, unknown> {
  const searchRules = normalizeAllowedUrlEntries(
    searchDomains
      .map((entry) => buildAllowedUrlRuleFromInput(entry.domain, entry.scope))
      .filter((rule): rule is NonNullable<typeof rule> => rule != null) as AllowedUrlEntry[],
  );
  const chatbotRules = normalizeAllowedUrlEntries((existing.chatbot_domains ?? []) as AllowedUrlEntry[]);

  return {
    publicId: existing.publicId ?? `search-widget-${Date.now().toString(36)}`,
    keys: existing.keys ?? [],
    domains: [],
    chatbot_domains: chatbotRules,
    search_domains: searchRules,
  };
}

export function buildModelLabel(settings: ModelSettings): string {
  return `${formatModelProviderLabel(settings.provider)} · ${settings.chatModel}`;
}

export function mapModelStatusFromRag(body: unknown, embeddingModel: string): ModelStatus | null {
  const data = asRecord(unwrapSearchApiData(body) ?? body);
  if (!data) return null;
  return {
    activeVectors: asNumber(data.active_vectors) ?? asNumber(data.activeVectors) ?? 0,
    storedEmbeddingModel: asString(data.embedding_model) ?? asString(data.active_model) ?? embeddingModel,
    needsReindex: Boolean(data.needs_reindex ?? data.needsReindex),
  };
}

export function mapEmbeddingStatusToModelStatus(
  status: {
    active_model: string;
    active_vectors: number;
    needs_reindex: boolean;
  },
): ModelStatus {
  return {
    activeVectors: status.active_vectors,
    storedEmbeddingModel: status.active_model,
    needsReindex: status.needs_reindex,
  };
}

export function parseEmbeddingStatus(body: unknown): import('@/features/search-config/types/embedding.types').EmbeddingStatus | null {
  const data = asRecord(unwrapSearchApiData(body) ?? body);
  if (!data || !asString(data.active_model)) return null;
  return data as unknown as import('@/features/search-config/types/embedding.types').EmbeddingStatus;
}

export function parseReindexProgress(body: unknown): import('@/features/search-config/types/embedding.types').ReindexProgress | null {
  const data = asRecord(unwrapSearchApiData(body) ?? body);
  if (!data || !asString(data.status)) return null;
  return data as unknown as import('@/features/search-config/types/embedding.types').ReindexProgress;
}
