export type SearchConfigPrimaryTab = 'training' | 'settings' | 'integrations' | 'search-test';

export type TrainingSubTab = 'overview' | 'active-config' | 'history';

export type SearchHistoryTimeRange = 'all' | 'today' | '7d' | '30d' | '1y';

export type SettingsSection =
  | 'overview'
  | 'model'
  | 'domains'
  | 'citation'
  | 'search-box'
  | 'search-customization'
  | 'predefined'
  | 'privacy'
  | 'integrations'
  | 'search-test';

export type PrivacySettings = {
  storeHistoryEnabled: boolean;
};

export type SearchConfigFeedback = {
  type: 'success' | 'error';
  message: string;
} | null;

export type ModelProvider = 'openai' | 'anthropic' | 'mistral' | 'google-gemini' | 'custom-llm' | 'ollama';

export type ModelSettings = {
  provider: ModelProvider;
  chatModel: string;
  embeddingModel: string;
  apiKey: string;
  /** Masked or partial key from API — used for overview preview and saved-key hints. */
  apiKeyMasked: string;
  /** Per-provider masked keys for cache-like provider switching (project-scoped). */
  providerApiKeys: Record<string, string>;
  temperature: number;
  maxTokens: number;
  topP: number;
  bestOf: number;
  frequencyPenalty: number;
  presencePenalty: number;
  topKResults: number;
  similarityThreshold: number;
  useReranker: boolean;
  systemPrompt: string;
};

export type ModelStatus = {
  activeVectors: number;
  storedEmbeddingModel: string;
  needsReindex: boolean;
};

export type DomainScope = 'entire-site' | 'page-only' | 'page-and-subpaths';

export type AllowedDomain = {
  id: string;
  domain: string;
  scope: DomainScope;
  addedAt: string;
};

export type CitationFormat = {
  citationStyle: 'compact' | 'detailed' | 'card' | 'minimal';
  layout: 'vertical' | 'grid';
  numberingStyle: 'square' | 'parentheses' | 'periods' | 'plain';
  colorScheme: 'default' | 'primary' | 'muted' | 'accent';
  showSnippets: boolean;
  showUrls: boolean;
  showSourceCount: boolean;
  enableHoverEffects: boolean;
  maxSnippetLength: number;
};

export type SearchBoxLanguage =
  | 'en-us'
  | 'en-gb'
  | 'hi'
  | 'es'
  | 'fr'
  | 'de'
  | 'ar'
  | 'pt-br'
  | 'zh-cn';

export type SearchBoxStyle = 'default' | 'customise';

export type SearchBoxIcon = 'search' | 'scan' | 'sparkles';

export type SearchBoxLoader = 'skeleton' | 'typing';

export type SearchBoxBorderRadius = 'rounded' | 'medium-rounded' | 'semi-rounded' | 'square';

export type SearchBoxConfig = {
  title: string;
  language: SearchBoxLanguage;
  style: SearchBoxStyle;
  searchIcon: SearchBoxIcon;
  loader: SearchBoxLoader;
  backgroundColor: string;
  borderRadius: SearchBoxBorderRadius;
  collectUserFeedback: boolean;
  resultStyle: 'list';
};

export type SearchBoxFormType = 'default' | 'with-button';

export type SearchBoxButtonType = 'search-icon' | 'with-label';

export type SearchBoxCustomization = {
  searchFormType: SearchBoxFormType;
  buttonType: SearchBoxButtonType;
  searchButtonText: string;
  searchInputPlaceholder: string;
  recentSearchEnabled: boolean;
  recentSearchTitle: string;
  showSpeechInput: boolean;
  showSpeechOutput: boolean;
};

export type PredefinedQuestion = {
  id: string;
  text: string;
  order: number;
  answer?: string;
};

export type PredefinedQuestionsSettings = {
  enabled: boolean;
  questionLimit: number;
  questionsPosition: 'below-search';
  questions: PredefinedQuestion[];
};

export type IntegrationScripts = {
  webSnippet: string;
  mobileSnippet: string;
};

export type IntegrationCredentials = {
  projectId: string | null;
  apiEndpoint: string;
  embedToken?: string;
  mobileApiKeyPlaceholder: string;
};

export type SearchHistoryEntry = {
  id: string;
  session_id: string;
  message_id: string;
  user_message: string;
  assistant_response: string;
  message_type: 'search';
  sources: unknown | null;
  feedback: unknown | null;
  feedback_rating: unknown | null;
  feedback_text: string | null;
  context_tags: string[] | null;
  created_at: string;
  execution_snapshot: unknown | null;
  feedback_moderation: unknown | null;
  // Backward-compatible optional fields for legacy UI logic.
  query?: string;
  resultsCount?: number;
  latencyMs?: number;
  createdAt?: string;
  status?: 'success' | 'failed';
};

export type TrainingOverview = {
  indexedDocuments: number;
  lastTrainedAt: string | null;
  activeConfigName: string;
  searchReady: boolean;
  avgLatencyMs: number;
};

export type ActiveTrainingConfig = {
  id: string;
  name: string;
  model: string;
  status: 'active' | 'draft';
  updatedAt: string;
  documentCount: number;
  embeddingModel: string;
};

export type SettingsOverview = {
  modelLabel: string;
  domainCount: number;
  predefinedCount: number;
  lastPublishedAt: string | null;
};

export type SearchTestCitation = {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  image?: string;
};

export type SearchTestResult = {
  id: string;
  sessionId?: string;
  answer: string;
  citations: SearchTestCitation[];
  latencyMs: number;
};

export type SearchResponseConfig = {
  responseType: 'long' | 'short';
};

export type AvailableSearchModels = {
  providers: { key: string; label: string }[];
  chatModelsByProvider: Record<string, { key: string; label: string }[]>;
  embeddingModelsByProvider: Record<string, { key: string; label: string }[]>;
};

export type SearchConfigBundle = {
  trainingOverview: TrainingOverview;
  activeConfig: ActiveTrainingConfig;
  searchHistory: SearchHistoryEntry[];
  settingsOverview: SettingsOverview;
  modelSettings: ModelSettings;
  modelStatus: ModelStatus;
  allowedDomains: AllowedDomain[];
  citationFormat: CitationFormat;
  searchBoxConfig: SearchBoxConfig;
  searchBoxCustomization: SearchBoxCustomization;
  privacySettings: PrivacySettings;
  predefinedQuestions: PredefinedQuestionsSettings;
  integrationScripts: IntegrationScripts;
  integrationCredentials: IntegrationCredentials;
  searchResponseConfig: SearchResponseConfig;
  availableModels: AvailableSearchModels | null;
};
