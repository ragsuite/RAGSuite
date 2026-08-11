export type CompareModelProvider =
  | 'openai'
  | 'anthropic'
  | 'mistral'
  | 'google-gemini'
  | 'ollama'
  | 'custom-llm';

export type CompareModelsSourceOrigin = 'chat' | string;

export type SavedModelConfig = {
  id: string;
  provider: CompareModelProvider;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  enabled: boolean;
  isRuntimeConfig?: boolean;
  apiKeyMasked?: string;
  maxTokens?: number;
};

export type CompareModelSource = {
  title: string;
  url: string;
  snippet?: string;
};

export type CompareModelResult = {
  configId: string;
  provider: CompareModelProvider;
  providerLabel: string;
  modelLabel: string;
  score: number;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  configOrigin: CompareModelsSourceOrigin;
  answerHtml: string;
  overviewText: string;
  sources: CompareModelSource[];
  error?: string | null;
};

export type CompareRun = {
  query: string;
  results: CompareModelResult[];
  ranAt: string;
  modelCount?: number;
  configuredSource?: CompareModelsSourceOrigin;
  effectiveSource?: CompareModelsSourceOrigin;
};

export type AddModelConfigInput = {
  provider: CompareModelProvider;
  modelId: string;
};
