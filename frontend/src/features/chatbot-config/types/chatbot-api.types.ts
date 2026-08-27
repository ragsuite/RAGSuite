export type ChatbotApiQueryParams = {
  projectId?: string | null;
};

export type ChatbotPromptUpdate = {
  welcome_message?: string;
  prompt?: string;
  system_prompt?: string;
};

export type ChatbotConfigurationUpdate = {
  chatbot_title: string;
  short_description?: string;
  bubble_message: string;
  welcome_message: string;
  chatbot_language: string;
  feedback_enabled?: boolean;
};

export type ChatbotCustomizationUpdate = {
  widget_logo_url: string | null;
  widget_avatar: string;
  widget_avatar_size: number;
  widget_chatbot_color: string;
  widget_background_color: string;
  widget_text_color: string;
  widget_width?: number | null;
  widget_height?: number | null;
  widget_show_logo: boolean;
  widget_show_date_time: boolean;
  widget_show_backdrop: boolean;
  widget_show_speech_input: boolean;
  widget_show_speech_output: boolean;
  widget_bottom_space: number;
  widget_font_size?: number;
  widget_trigger_border_radius: number;
  widget_panel_border_radius: number;
  widget_position: string;
  widget_z_index: number;
  widget_offset_x: number;
  widget_offset_y: number;
};

export type ConfigModelsData = {
  model_provider: string;
  chat_model?: string | null;
  embedding_model: string;
  api_key?: string;
  api_key_masked?: string;
  provider_api_keys?: Record<string, string>;
  chat_temperature?: string | number | null;
  chat_top_p?: string | number | null;
  chat_best_of?: number | null;
  chat_frequency_penalty?: string | number | null;
  chat_presence_penalty?: string | number | null;
  chat_top_k?: number | null;
  chat_similarity_threshold?: number | null;
  chat_max_tokens?: number | null;
  chat_use_reranker?: boolean | null;
};

export type ConfigModelsUpdate = ConfigModelsData;
