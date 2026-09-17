export type AiAssistantCapabilities = {
  voice: boolean;
  voice_stt: boolean;
  voice_tts: boolean;
};

export type AiAssistantDefaultMode = 'ops' | 'sources';
export type AiAssistantAnswerLength = 'short' | 'balanced' | 'detailed';
export type AiAssistantLoadingStyle = 'typing' | 'skeleton';

export type AiAssistantToolScope = {
  ui_howto: boolean;
  ops_metrics: boolean;
  ops_history: boolean;
  crawl_and_jobs: boolean;
  product_links: boolean;
};

export type AiAssistantSettings = {
  configured: boolean;
  model_provider: string;
  chat_model?: string | null;
  api_key_masked?: string | null;
  has_api_key: boolean;
  /** Per-provider masked keys for cache-like provider switching (project-scoped). */
  provider_api_keys?: Record<string, string>;
  base_url?: string | null;
  temperature?: string | null;
  max_tokens?: number | null;
  /** Reply language code (same set as chatbot_language). */
  language?: string | null;
  default_mode?: AiAssistantDefaultMode | null;
  answer_length?: AiAssistantAnswerLength | null;
  show_citations?: boolean;
  tool_scope?: AiAssistantToolScope | null;
  ops_lookback_days?: number | null;
  loading_style?: AiAssistantLoadingStyle | null;
};

export type AiAssistantSettingsUpdate = {
  model_provider?: string;
  chat_model?: string;
  api_key?: string;
  base_url?: string;
  temperature?: string;
  max_tokens?: number | null;
  language?: string;
  default_mode?: AiAssistantDefaultMode;
  answer_length?: AiAssistantAnswerLength;
  show_citations?: boolean;
  tool_scope?: AiAssistantToolScope;
  ops_lookback_days?: number;
  loading_style?: AiAssistantLoadingStyle;
};

export type AiAssistantSession = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AiAssistantCitation = {
  title: string;
  url?: string;
  /** Optional OG / preview image URL from crawled page metadata. */
  image?: string;
};

export type AiAssistantMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | string;
  content?: string | null;
  tool_name?: string | null;
  created_at?: string | null;
  /** Sources-mode citations persisted with the assistant message when show_citations is on. */
  citations?: AiAssistantCitation[] | null;
};

export type AiAssistantChatEvent =
  | { type: 'token'; content: string }
  | { type: 'tool'; name: string; result: unknown }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string }
  | { type: 'message_id'; id: string }
  | { type: 'sources'; items: AiAssistantCitation[] };
