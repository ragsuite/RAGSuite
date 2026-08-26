import type {
  ChatbotApiQueryParams,
  ChatbotConfigurationUpdate,
  ChatbotCustomizationUpdate,
  ChatbotPromptUpdate,
  ConfigModelsUpdate,
} from '@/features/chatbot-config/types/chatbot-api.types';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, post, put } from '@/network/request';

function withProjectQuery(path: string, params: ChatbotApiQueryParams = {}): string {
  if (!params.projectId?.trim()) return path;
  const search = new URLSearchParams({ project_id: params.projectId.trim() });
  return `${path}?${search.toString()}`;
}

export async function handleGetChatbotSettings(params: ChatbotApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.CHATBOT_SETTINGS, params));
}

export async function handleSaveChatbotConfiguration(
  body: ChatbotConfigurationUpdate,
  params: ChatbotApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.CHATBOT_CONFIGURATION, params), body);
}

export async function handleSaveChatbotCustomization(
  body: ChatbotCustomizationUpdate,
  params: ChatbotApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.CHATBOT_CUSTOMIZATION, params), body);
}

export async function handleGetChatbotActivation(params: ChatbotApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.CHATBOT_ACTIVATE, params));
}

export async function handleUpdateChatbotActivation(
  isActive: boolean,
  params: ChatbotApiQueryParams = {},
): Promise<unknown> {
  return put(withProjectQuery(API_CONFIG.CHATBOT_ACTIVATE, params), { is_active: isActive });
}

export async function handleGetChatPrompt(): Promise<unknown> {
  return get(API_CONFIG.CHAT_PROMPT);
}

export async function handleSaveChatPrompt(body: ChatbotPromptUpdate): Promise<unknown> {
  return post(API_CONFIG.CHAT_PROMPT, body);
}

export async function handleGetConfigModels(params: ChatbotApiQueryParams = {}): Promise<unknown> {
  return get(withProjectQuery(API_CONFIG.CONFIG_MODELS, params));
}

export async function handleSaveConfigModels(
  body: ConfigModelsUpdate,
  params: ChatbotApiQueryParams = {},
): Promise<unknown> {
  return post(withProjectQuery(API_CONFIG.CONFIG_MODELS, params), body);
}

export async function handleTestConfigModels(
  body: Record<string, unknown>,
  params: ChatbotApiQueryParams = {},
): Promise<unknown> {
  // Chat + embed probes run sequentially (up to ~12s each); keep above 2× stage.
  return post(withProjectQuery(API_CONFIG.CONFIG_MODELS_TEST, params), body, { timeout: 30_000 });
}

export async function handleGetConfigModelsCatalog(): Promise<unknown> {
  return get(API_CONFIG.CONFIG_MODELS_CATALOG);
}

export async function handleGetIntegrationsEmbed(): Promise<unknown> {
  return get(API_CONFIG.INTEGRATIONS_EMBED);
}

export async function handleUpdateIntegrationsEmbed(body: Record<string, unknown>): Promise<unknown> {
  return post(API_CONFIG.INTEGRATIONS_EMBED, body);
}

export async function handleGetAvatars(): Promise<unknown> {
  return get(API_CONFIG.AVATARS);
}

export async function handleClearChatSession(
  sessionId: string,
  /**
   * `widget` — hide from chatbot UI, keep rows for History (default, safe).
   * `page` — permanent delete (admin History / training only).
   */
  source: 'page' | 'widget' = 'widget',
): Promise<unknown> {
  const search = new URLSearchParams({ source });
  return deleteApi(`${API_CONFIG.chatSession(sessionId)}?${search.toString()}`);
}

export async function handleDeleteAllChatMessages(source = 'page'): Promise<unknown> {
  const search = new URLSearchParams({ source });
  return deleteApi(`${API_CONFIG.CHAT_MESSAGES}?${search.toString()}`);
}
