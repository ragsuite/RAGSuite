export type SearchApiQueryParams = {
  projectId?: string | null;
};

export type SearchHistoryQueryParams = SearchApiQueryParams & {
  sessionId?: string | null;
  limit?: number;
  source?: 'widget' | 'page';
  grouped?: boolean;
};

export type SearchSessionDeleteParams = SearchApiQueryParams & {
  source?: 'widget' | 'page';
};

export type PromptUpdateRequest = {
  welcome_message: string;
  /** Some API builds also accept a plain prompt field. */
  prompt?: string;
  system_prompt?: string;
};

export type ResponseConfigUpdate = {
  response_type?: 'long' | 'short';
  max_tokens?: number;
};

export type RagSettingsOut = {
  top_k?: number;
  topK?: number;
  similarity_threshold?: number;
  similarityThreshold?: number;
  use_reranker?: boolean;
  useReranker?: boolean;
  max_tokens?: number;
  maxTokens?: number;
};

export type RagQueryRequest = {
  query: string;
  top_k?: number;
  use_reranker?: boolean;
  session_id?: string;
  similarity_threshold?: number;
};

export type SearchFeedbackRequest = {
  session_id: string;
  message_id: string;
  feedback: boolean;
  rating?: number;
  feedback_text?: string;
  context_tags?: string[];
};

export type CompareSearchRequest = {
  query: string;
  session_id?: string;
  topK?: number;
  similarityThreshold?: number;
  maxTokens?: number;
};

export type SearchActivateRequest = {
  is_active?: boolean;
};

export type ChatConfigUpdate = {
  provider?: string;
  model_name?: string;
  chat_model?: string;
  embedding_model?: string;
  api_key?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  best_of?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  top_k?: number;
  similarity_threshold?: number;
  use_reranker?: boolean;
  system_prompt?: string;
};

/** Reference `/search/models/` write payload. */
export type SearchModelConfigUpdate = {
  model_provider: string;
  search_model: string;
  embedding_model: string;
  api_key?: string;
  search_temperature?: number | string | null;
  search_top_p?: number | string | null;
  search_best_of?: number | null;
  search_frequency_penalty?: number | string | null;
  search_presence_penalty?: number | string | null;
  search_top_k?: number;
  search_similarity_threshold?: number;
  search_max_tokens?: number;
  search_use_reranker?: boolean;
  response_type?: 'long' | 'short';
};

export type TestSearchConfigRequest = {
  provider?: string;
  model_provider?: string;
  model_name?: string;
  search_model?: string;
  chat_model?: string;
  embedding_model?: string;
  api_key?: string;
};

export type CitationFormattingUpdate = {
  citation_style?: string;
  layout?: string;
  numbering_style?: string;
  color_scheme?: string;
  show_snippets?: boolean;
  show_urls?: boolean;
  show_source_count?: boolean;
  enable_hover_effects?: boolean;
  max_snippet_length?: number;
};

export type SearchConfigurationUpdate = {
  title?: string;
  language?: string;
  feedback_enabled?: boolean;
  styleOption?: string;
  style?: string;
  searchIcon?: string;
  search_icon?: string;
  loaderType?: string;
  loader?: string;
  background?: string;
  background_color?: string;
  borderRadius?: string;
  border_radius?: string;
  resultStyle?: string;
  collect_user_feedback?: boolean;
};

export type SearchCustomizationUpdate = {
  searchFormType?: string;
  search_form_type?: string;
  buttonType?: string;
  button_type?: string;
  searchButtonText?: string;
  search_button_text?: string;
  searchInputPlaceholder?: string;
  search_input_placeholder?: string;
  recentSearch?: boolean;
  recent_search_enabled?: boolean;
  recentSearchTitle?: string;
  recent_search_title?: string;
  predefinedQuestions?: boolean;
  predefined_questions_enabled?: boolean;
  questionsPosition?: string;
  questionsLimit?: number;
  predefined_question_limit?: number;
  questions?: Array<string | { question?: string; text?: string; answer?: string; order?: number }>;
  predefined_questions?: Array<{ text?: string; question?: string; answer?: string; order?: number }>;
};

export type ModelConfigProfileCreate = {
  name: string;
  provider: string;
  model_name: string;
  api_key?: string;
  embedding_model?: string;
  compare_enabled?: boolean;
  extra_params?: Record<string, unknown>;
};

export type ModelConfigProfileUpdate = Partial<ModelConfigProfileCreate>;

export type SearchApiResponse<T = unknown> = {
  success?: boolean;
  data?: T;
  message?: string;
} & Record<string, unknown>;

export type SearchQueryResponse = {
  answer?: string;
  response?: string;
  message_id?: string;
  id?: string;
  session_id?: string;
  sources?: Array<Record<string, unknown>>;
  latency_ms?: number;
  total_ms?: number;
};

export type SearchActivationStatus = {
  is_search_active?: boolean;
  is_active?: boolean;
};

import type { AllowedUrlEntry } from '@/features/search-config/utils/allowed-url-rules';
