export type ChatbotConfigPrimaryTab = 'training' | 'settings' | 'integrations';

import type { AvailableSearchModels } from '@/features/search-config/types/search-config.types';

export type TrainingSubTab = 'overview' | 'active-config' | 'history';

export type HistoryTimeRange = 'all' | 'today' | '7d' | '30d' | 'year';

export type DomainScope = 'entire-site' | 'page-only' | 'page-and-subpaths';

export type SettingsSection =
  | 'overview'
  | 'model'
  | 'widget-config'
  | 'widget-customization'
  | 'domains'
  | 'feedback'
  | 'integrations'
  | 'web-integration'
  | 'mobile-integration';

export type ChatbotConfigFeedback = {
  type: 'success' | 'error';
  message: string;
} | null;

/** Raw row from GET /api/v1/chat/history (or equivalent). */
export type ChatHistoryApiRow = {
  id: string;
  session_id: string;
  message_id: string;
  user_message: string;
  assistant_response: string;
  message_type: string;
  sources: { title: string; url: string }[] | null;
  feedback: string | null;
  feedback_rating: number | null;
  feedback_text: string | null;
  context_tags: string[] | null;
  created_at: string;
  history_status: string;
  history_confidence: number | null;
  history_total_ms: number;
};

export type ChatHistorySource = {
  title: string;
  url: string;
};

export type ChatHistoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatHistorySource[];
  createdAt: string;
  feedbackRating?: number | null;
};

export type ChatConversation = {
  sessionId: string;
  title: string;
  previewText: string;
  messageCount: number;
  lastMessageAt: string;
  status: 'success' | 'failed';
  latencyMs: number;
  messages: ChatHistoryMessage[];
};

/** @deprecated Use ChatConversation — kept for transitional bundle fields. */
export type ChatHistoryEntry = {
  id: string;
  sessionLabel: string;
  messageCount: number;
  latencyMs: number;
  createdAt: string;
  status: 'success' | 'failed';
};

export type ModelStatus = {
  projectId: string;
  source: string;
  activeProvider: string;
  activeModel: string;
  activeCollection: string;
  activeVectors: number;
  totalDocuments: number;
  needsReindex: boolean;
  modelMeta: {
    dim?: number;
    maxTokens?: number;
    batch?: number;
    metric?: string;
    normalize?: boolean;
    needsApiKey?: boolean;
    known?: boolean;
  };
  fallbackUsed: boolean;
};

export type TrainingOverviewStats = {
  chatbotActive: boolean;
  systemPromptWordCount: number;
  systemPromptCharCount: number;
  conversationCount: number;
  totalMessageCount: number;
};

export type ModelSettings = {
  provider: string;
  chatModel: string;
  embeddingModel: string;
  /** Draft API key — cleared after save; never persisted in bundle from masked server value. */
  apiKey: string;
  apiKeyMasked: string;
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

export type AllowedDomainEntry = {
  id: string;
  domain: string;
  scope: DomainScope;
  addedAt: string;
};

/** @deprecated Use AllowedDomainEntry */
export type AllowedDomain = AllowedDomainEntry;

export type ChatWidgetConfig = {
  title: string;
  bubbleMessage: string;
  welcomeMessage: string;
  language: string;
  greeting: string;
  placeholder: string;
  showLauncher: boolean;
  launcherLabel: string;
  position: 'bottom-right' | 'bottom-left';
  accentColor: string;
};

export type ChatWidgetCustomization = {
  logoUrl: string | null;
  avatarId: string;
  avatarUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  gradientAngle: number;
  fontSize: number;
  bubbleRadius: number;
  avatarSize: number;
  widgetBottomSpace: number;
  customWidthEnabled: boolean;
  widgetWidth: number;
  shadow: boolean;
  headerColor: string;
  backgroundColor: string;
  textColor: string;
  showLogo: boolean;
  showDateTime: boolean;
};

export type FeedbackSettings = {
  collectFeedback: boolean;
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

export type TrainingOverview = {
  indexedDocuments: number;
  lastTrainedAt: string | null;
  activeConfigName: string;
  chatReady: boolean;
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
  chatbotActive: boolean;
  systemPrompt: string;
  systemPromptIsDefault: boolean;
};

export type SettingsOverviewDomainPreview = {
  domain: string;
  scope: DomainScope;
};

export type SettingsOverview = {
  provider: string;
  chatModel: string;
  embeddingModel: string;
  apiKeyMasked: string;
  chatbotTitle: string;
  language: string;
  widgetPosition: string;
  avatarSize: number;
  showLogo: boolean;
  showDateTime: boolean;
  domainCount: number;
  domainPreview: SettingsOverviewDomainPreview[];
  modelLabel: string;
  widgetPublished: boolean;
  lastPublishedAt: string | null;
};

export type AvatarOption = {
  id: string;
  name: string;
  filename: string;
  url: string;
};

export type AvailableChatModels = AvailableSearchModels;

export type ChatbotConfigBundle = {
  trainingOverview: TrainingOverview;
  trainingStats: TrainingOverviewStats;
  activeConfig: ActiveTrainingConfig;
  conversations: ChatConversation[];
  /** Legacy list derived from conversations for overview counts. */
  chatHistory: ChatHistoryEntry[];
  modelStatus: ModelStatus | null;
  settingsOverview: SettingsOverview;
  modelSettings: ModelSettings;
  availableModels: AvailableChatModels | null;
  avatarOptions: AvatarOption[];
  allowedDomains: AllowedDomainEntry[];
  chatWidgetConfig: ChatWidgetConfig;
  chatWidgetCustomization: ChatWidgetCustomization;
  feedbackSettings: FeedbackSettings;
  integrationScripts: IntegrationScripts;
  integrationCredentials: IntegrationCredentials;
};
