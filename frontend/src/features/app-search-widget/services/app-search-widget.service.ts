import { DEFAULT_SEARCH_WIDGET_CUSTOMIZATION } from '@/features/search-config/components/settings/SearchWidgetLiveSurface';
import type {
  ModelSettings,
  PredefinedQuestionsSettings,
  SearchBoxConfig,
  SearchBoxCustomization,
  SearchResponseConfig,
  SearchTestResult,
} from '@/features/search-config/types/search-config.types';
import {
  mapRagSettingsToModelFields,
  mapSearchActivationStatus,
  mapSearchConfigurationApi,
  mapPrivacyFromSearchConfiguration,
  mapSearchCustomizationApi,
  mapSearchResponseConfigApi,
} from '@/features/search-config/utils/search-api-mappers';
import { findPredefinedSearchAnswer } from '@/features/search-config/utils/search-test-options';
import type { SearchTestFeedbackPayload } from '@/features/search-config/utils/search-test-feedback-options';
import { buildSearchStreamRequestBody, consumeSearchStream } from '@/features/search-config/utils/search-stream';
import {
  handleGetRagSettings,
  handleGetSearchActivationStatus,
  handleGetSearchConfiguration,
  handleGetSearchCustomization,
  handleGetSearchResponseConfig,
  handlePostSearchStream,
  handleSubmitSearchFeedback,
} from '@/network/actions/search-config.actions';

const DEFAULT_CONFIG: SearchBoxConfig = {
  title: 'Search',
  language: 'en-us',
  style: 'customise',
  searchIcon: 'search',
  loader: 'skeleton',
  backgroundColor: '#d5d4d4',
  borderRadius: 'semi-rounded',
  collectUserFeedback: true,
  resultStyle: 'list',
};

const DEFAULT_PREDEFINED: PredefinedQuestionsSettings = {
  enabled: false,
  questionLimit: 5,
  questionsPosition: 'below-search',
  questions: [],
};

const DEFAULT_MODEL: Pick<
  ModelSettings,
  'topKResults' | 'similarityThreshold' | 'useReranker' | 'maxTokens'
> = {
  topKResults: 5,
  similarityThreshold: 0.2,
  useReranker: false,
  maxTokens: 1000,
};

let activeProjectId: string | null = null;

export function configureAppSearchWidgetProject(projectId: string | null): void {
  activeProjectId = projectId?.trim() || null;
}

function projectParams() {
  return activeProjectId ? { projectId: activeProjectId } : {};
}

async function tryRead<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export type AppSearchWidgetSettings = {
  config: SearchBoxConfig;
  customization: SearchBoxCustomization;
  predefinedQuestions: PredefinedQuestionsSettings;
  searchActive: boolean;
  collectFeedback: boolean;
  storeHistoryEnabled: boolean;
  topKResults: number;
  similarityThreshold: number;
  useReranker: boolean;
  maxTokens: number;
  responseType: SearchResponseConfig['responseType'];
};

export async function fetchSearchWidgetSettings(): Promise<AppSearchWidgetSettings> {
  const params = projectParams();
  const [activation, configuration, customization, ragSettings, responseConfig] = await Promise.all([
    tryRead(() => handleGetSearchActivationStatus(params)),
    tryRead(() => handleGetSearchConfiguration(params)),
    tryRead(() => handleGetSearchCustomization(params)),
    tryRead(() => handleGetRagSettings(params)),
    tryRead(() => handleGetSearchResponseConfig(params)),
  ]);

  const mappedConfig = configuration
    ? mapSearchConfigurationApi(configuration, DEFAULT_CONFIG)
    : DEFAULT_CONFIG;
  const mappedCustom = customization
    ? mapSearchCustomizationApi(customization, DEFAULT_SEARCH_WIDGET_CUSTOMIZATION, DEFAULT_PREDEFINED)
    : { customization: DEFAULT_SEARCH_WIDGET_CUSTOMIZATION, predefined: DEFAULT_PREDEFINED };
  const modelFields = ragSettings
    ? mapRagSettingsToModelFields(ragSettings, {
        provider: 'openai',
        chatModel: '',
        embeddingModel: '',
        apiKey: '',
        apiKeyMasked: '',
        providerApiKeys: {},
        temperature: 0,
        maxTokens: DEFAULT_MODEL.maxTokens,
        topP: 1,
        bestOf: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
        topKResults: DEFAULT_MODEL.topKResults,
        similarityThreshold: DEFAULT_MODEL.similarityThreshold,
        useReranker: DEFAULT_MODEL.useReranker,
        systemPrompt: '',
      })
    : null;
  const mappedResponse = responseConfig
    ? mapSearchResponseConfigApi(responseConfig, { responseType: 'long' })
    : { responseType: 'long' as const };
  const searchActive = activation != null ? mapSearchActivationStatus(activation) !== false : true;
  const privacy = mapPrivacyFromSearchConfiguration(configuration, { storeHistoryEnabled: true });
  const storeHistoryEnabled = privacy?.storeHistoryEnabled ?? true;

  return {
    config: mappedConfig ?? DEFAULT_CONFIG,
    customization: mappedCustom?.customization ?? DEFAULT_SEARCH_WIDGET_CUSTOMIZATION,
    predefinedQuestions: mappedCustom?.predefined ?? DEFAULT_PREDEFINED,
    searchActive,
    collectFeedback: (mappedConfig?.collectUserFeedback ?? true) && storeHistoryEnabled,
    storeHistoryEnabled,
    topKResults: modelFields?.topKResults ?? DEFAULT_MODEL.topKResults,
    similarityThreshold: modelFields?.similarityThreshold ?? DEFAULT_MODEL.similarityThreshold,
    useReranker: modelFields?.useReranker ?? DEFAULT_MODEL.useReranker,
    maxTokens: modelFields?.maxTokens ?? DEFAULT_MODEL.maxTokens,
    responseType: mappedResponse?.responseType ?? 'long',
  };
}

export async function streamSearchWidgetQuery(
  query: string,
  settings: AppSearchWidgetSettings,
  sessionId: string | undefined,
  onToken?: (token: string, accumulated: string) => void,
): Promise<SearchTestResult> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('errors.search.emptyQuery');

  const predefinedAnswer = settings.predefinedQuestions.enabled
    ? findPredefinedSearchAnswer(trimmed, settings.predefinedQuestions.questions)
    : null;
  if (predefinedAnswer) {
    return {
      id: `local_${Date.now()}`,
      sessionId: sessionId ?? `search_${Date.now()}`,
      answer: predefinedAnswer,
      citations: [],
      latencyMs: 0,
    };
  }

  const streamBody = buildSearchStreamRequestBody({
    query: trimmed,
    topK: settings.topKResults,
    similarityThreshold: settings.similarityThreshold,
    useReranker: settings.useReranker,
    maxTokens: settings.maxTokens,
    responseType: settings.responseType,
    sessionId,
  });

  const startTime = Date.now();
  const streamResponse = await handlePostSearchStream(streamBody, projectParams());
  const streamed = await consumeSearchStream(streamResponse, { onToken });
  return {
    id: streamed.message_id || `msg_${Date.now()}`,
    sessionId: streamed.session_id || sessionId,
    answer: streamed.answer,
    citations: streamed.sources,
    latencyMs: Date.now() - startTime,
  };
}

export async function submitSearchWidgetFeedback(
  payload: SearchTestFeedbackPayload,
  sessionId: string | undefined,
): Promise<void> {
  if (!sessionId) {
    throw new Error('errors.search.sessionUnavailable');
  }
  await handleSubmitSearchFeedback(
    {
      session_id: sessionId,
      message_id: payload.resultId,
      feedback: payload.sentiment === 'positive',
      rating: payload.rating,
      feedback_text: payload.comments || undefined,
      context_tags: payload.reasons.length > 0 ? payload.reasons : undefined,
    },
    projectParams(),
  );
}
