export type NativeModelProviderKey = 'openai' | 'azure_openai' | 'anthropic' | 'mistral' | 'gemini' | 'ollama';
export type ModelProviderKey = NativeModelProviderKey | string;
export type ProviderAdapter = 'native' | 'openai_compatible';
export const PROVIDER_KINDS = ['chat', 'embedding', 'asr', 'rerank', 'tts', 'ocr'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
export const EXTRA_PROVIDER_KINDS = ['asr', 'rerank', 'tts', 'ocr'] as const;
export type ExtraProviderKind = (typeof EXTRA_PROVIDER_KINDS)[number];

export type ModelOption = { key: string; label: string };

export type ProviderTestStatus = 'success' | 'failed' | null;

export type TuningSurface = 'chat' | 'search';

/** Model-specific widget tuning; `null` means the widget keeps its own value. */
export type SurfaceTuning = {
  temperature: number | null;
  similarityThreshold: number | null;
  maxTokens: number | null;
};

export type ProviderSurfaceTuning = Record<TuningSurface, SurfaceTuning>;

export type SurfaceTuningDraft = { temperature: number; similarityThreshold: number; maxTokens: number };

export type ProviderConfig = {
  provider: ModelProviderKey;
  configured: boolean;
  hasApiKey: boolean;
  /** The provider refused the stored key on its last test. */
  keyRejected: boolean;
  apiKeyMasked: string;
  chatModel: string;
  embeddingModel: string;
  asrModel: string;
  ttsModel: string;
  rerankModel: string;
  ocrModel: string;
  /** Azure OpenAI resource endpoint (https://….openai.azure.com). */
  endpoint: string;
  /** Azure OpenAI API version override (empty → server default / env). */
  apiVersion: string;
  surfaces: ProviderSurfaceTuning;
  lastTestStatus: ProviderTestStatus;
  lastTestedAt: string | null;
};

export type ProviderCatalogEntry = {
  key: ModelProviderKey;
  label: string;
  adapter?: ProviderAdapter;
  kinds?: ProviderKind[];
  defaultBaseUrl?: string;
  docsUrl?: string;
  chatModels: ModelOption[];
  embeddingModels: ModelOption[];
  asrModels: ModelOption[];
  ttsModels: ModelOption[];
  rerankModels: ModelOption[];
  ocrModels: ModelOption[];
  config: ProviderConfig;
};

export type ModelConfigurationBundle = {
  providers: ProviderCatalogEntry[];
  configuredCount: number;
};

export type ProviderDraft = {
  chatModel: string;
  embeddingModel: string;
  asrModel: string;
  ttsModel: string;
  rerankModel: string;
  ocrModel: string;
  /** Field value: masked display for a saved key, or typed plaintext while editing. */
  apiKey: string;
  /** Azure OpenAI resource endpoint. */
  endpoint: string;
  /** Azure OpenAI API version override. */
  apiVersion: string;
  surfaces: Record<TuningSurface, SurfaceTuningDraft>;
};

export type ProviderConnectionResult = { ok: boolean; message: string };

/** Wire format (snake_case) — `/api/v1/model-configuration/*`. */
export type SurfaceTuningResponse = {
  temperature?: string | number | null;
  similarity_threshold?: string | number | null;
  max_tokens?: string | number | null;
};

export type ProviderConfigResponse = {
  provider: string;
  configured?: boolean;
  has_api_key?: boolean;
  key_rejected?: boolean;
  api_key_masked?: string | null;
  chat_model?: string | null;
  embedding_model?: string | null;
  asr_model?: string | null;
  tts_model?: string | null;
  rerank_model?: string | null;
  ocr_model?: string | null;
  endpoint?: string | null;
  api_version?: string | null;
  /** Legacy shared temperature; `surfaces` carries the per-widget values. */
  temperature?: string | null;
  surfaces?: Partial<Record<TuningSurface, SurfaceTuningResponse>>;
  last_test_status?: string | null;
  last_tested_at?: string | null;
};

export type ProviderCatalogResponse = {
  provider: string;
  value: string;
  adapter?: ProviderAdapter;
  kinds?: ProviderKind[];
  default_base_url?: string;
  docs_url?: string;
  chat_models?: { name?: string; value?: string }[];
  embedding_models?: { name?: string; value?: string }[];
  asr_models?: { name?: string; value?: string }[];
  tts_models?: { name?: string; value?: string }[];
  rerank_models?: { name?: string; value?: string }[];
  ocr_models?: { name?: string; value?: string }[];
  config?: ProviderConfigResponse;
};

export type ModelConfigurationResponse = {
  providers?: ProviderCatalogResponse[];
  configured_count?: number;
};

export type ProviderConfigSavePayload = {
  chat_model: string;
  embedding_model: string | null;
  asr_model: string | null;
  tts_model: string | null;
  rerank_model: string | null;
  ocr_model: string | null;
  api_key?: string;
  endpoint?: string;
  /** Empty string clears a stored Azure API version override. */
  api_version?: string | null;
  chat_temperature: number;
  search_temperature: number;
  chat_similarity_threshold: number;
  search_similarity_threshold: number;
  chat_max_tokens: number;
  search_max_tokens: number;
};

export type ProviderTestPayload = {
  chat_model: string;
  embedding_model: string | null;
  asr_model?: string | null;
  tts_model?: string | null;
  rerank_model?: string | null;
  ocr_model?: string | null;
  api_key?: string;
  endpoint?: string;
  api_version?: string | null;
};

export type ProviderTestResponse = {
  chat_model?: string;
  embedding_model?: string;
  credentials?: string;
};

/** Wire payload for listing Azure OpenAI deployment names. */
export type AzureDeploymentsListPayload = {
  api_key?: string;
  endpoint?: string;
  api_version?: string | null;
};

export type AzureDeploymentsListResult = {
  chat: string[];
  embedding: string[];
  error: string | null;
};
