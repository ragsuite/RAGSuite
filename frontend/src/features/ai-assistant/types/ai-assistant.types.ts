export type AiAssistantCapabilities = {
  voice: boolean;
  voice_stt: boolean;
  voice_tts: boolean;
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
};

export type AiAssistantSettingsUpdate = {
  model_provider?: string;
  chat_model?: string;
  api_key?: string;
  base_url?: string;
  temperature?: string;
  max_tokens?: number | null;
  language?: string;
};

export type AiAssistantSession = {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
};

export type AiAssistantMessage = {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system' | string;
  content?: string | null;
  tool_name?: string | null;
  created_at?: string | null;
};

export type AiAssistantChatEvent =
  | { type: 'token'; content: string }
  | { type: 'tool'; name: string; result: unknown }
  | { type: 'done'; content: string }
  | { type: 'error'; message: string }
  | { type: 'message_id'; id: string };
