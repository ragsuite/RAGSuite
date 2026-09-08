import type { ModelProvider } from '@/features/search-config/types/search-config.types';
import type { AvailableSearchModels } from '@/features/search-config/types/search-config.types';

export const MODEL_PROVIDER_OPTIONS: { key: ModelProvider; label: string }[] = [
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'mistral', label: 'Mistral' },
  { key: 'google-gemini', label: 'Google Gemini' },
  { key: 'ollama', label: 'Custom LLM / Ollama' },
];

const CHAT_MODELS_BY_PROVIDER: Record<ModelProvider, { key: string; label: string }[]> = {
  openai: [
    { key: 'gpt-4', label: 'GPT-4' },
    { key: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { key: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { key: 'gpt-4o', label: 'GPT-4o' },
    { key: 'gpt-4o-mini', label: 'GPT-4o-mini' },
    { key: 'gpt-4.1', label: 'GPT-4.1' },
    { key: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { key: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { key: 'gpt-5', label: 'GPT-5' },
    { key: 'gpt-5-mini', label: 'GPT-5 Mini' },
    { key: 'gpt-5-nano', label: 'GPT-5 Nano' },
    { key: 'gpt-5.1', label: 'GPT-5.1' },
    { key: 'gpt-5.2', label: 'GPT-5.2' },
    { key: 'gpt-5.4', label: 'GPT-5.4' },
    { key: 'gpt-5.4-pro', label: 'GPT-5.4 Pro' },
    { key: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
    { key: 'gpt-5.4-nano', label: 'GPT-5.4 Nano' },
    { key: 'o3', label: 'o3' },
    { key: 'o4-mini', label: 'o4-mini' },
  ],
  anthropic: [
    { key: 'claude-opus-5', label: 'Claude Opus 5' },
    { key: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
    { key: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' },
    { key: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
    { key: 'claude-opus-4-8', label: 'Claude Opus 4.8' },
    { key: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { key: 'claude-3-opus', label: 'Claude 3 Opus' },
    { key: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
    { key: 'claude-3-haiku', label: 'Claude 3 Haiku' },
    { key: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
    { key: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
    { key: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
    { key: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
    { key: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet' },
  ],
  mistral: [
    { key: 'mistral-small-latest', label: 'Mistral Small' },
    { key: 'ministral-3b-latest', label: 'Ministral 3B' },
    { key: 'ministral-8b-latest', label: 'Ministral 8B' },
    { key: 'ministral-14b-latest', label: 'Ministral 14B' },
    { key: 'mistral-medium-latest', label: 'Mistral Medium' },
    { key: 'mistral-large-latest', label: 'Mistral Large' },
    { key: 'open-mistral-nemo', label: 'Open Mistral Nemo' },
    { key: 'codestral-latest', label: 'Codestral' },
    { key: 'codestral-2508', label: 'Codestral 2508' },
    { key: 'magistral-medium-latest', label: 'Magistral Medium' },
    { key: 'magistral-small-latest', label: 'Magistral Small' },
    { key: 'labs-leanstral-1-5', label: 'Leanstral 1.5' },
    { key: 'labs-leanstral-1-5-1', label: 'Leanstral 1.5.1' },
    { key: 'mistral-large', label: 'Mistral Large (legacy)' },
    { key: 'mistral-medium', label: 'Mistral Medium (legacy)' },
    { key: 'mistral-small', label: 'Mistral Small (legacy)' },
  ],
  'google-gemini': [
    { key: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { key: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
    { key: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-lite' },
    { key: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { key: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
    { key: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { key: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { key: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' },
    { key: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
    { key: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  ],
  'custom-llm': [
    { key: 'default', label: 'Custom Model (Default)' },
    { key: 'custom-default', label: 'Custom Model (Default)' },
    { key: 'llama3:8b', label: 'Llama 3 8B' },
    { key: 'mistral', label: 'Mistral' },
    { key: 'gemma2', label: 'Gemma 2' },
    { key: 'gemma3:27b-cloud', label: 'Gemma 3 27B Cloud' },
    { key: 'gemma4:31b-cloud', label: 'Gemma 4 31B Cloud' },
  ],
  ollama: [
    { key: 'default', label: 'Custom Model (Default)' },
    { key: 'custom-default', label: 'Custom Model (Default)' },
    { key: 'llama3:8b', label: 'Llama 3 8B' },
    { key: 'mistral', label: 'Mistral' },
    { key: 'gemma2', label: 'Gemma 2' },
    { key: 'gemma3:27b-cloud', label: 'Gemma 3 27B Cloud' },
    { key: 'gemma4:31b-cloud', label: 'Gemma 4 31B Cloud' },
  ],
};

export const EMBEDDING_MODEL_OPTIONS = [
  { key: 'jina/jina-embeddings-v2-base-de', label: 'Jina v2 Base DE' },
  { key: 'jina/jina-embeddings-v2-base-en', label: 'Jina v2 Base EN' },
  { key: 'mistral-embed', label: 'mistral-embed' },
  { key: 'text-embedding-3-large', label: 'text-embedding-3-large' },
  { key: 'text-embedding-3-small', label: 'text-embedding-3-small' },
  { key: 'text-embedding-ada-002', label: 'text-embedding-ada-002' },
  { key: 'gemini-embedding-001', label: 'gemini-embedding-001' },
];

export function getChatModelsForProvider(provider: ModelProvider) {
  return CHAT_MODELS_BY_PROVIDER[provider] ?? CHAT_MODELS_BY_PROVIDER.openai;
}

export function paramFieldLabel(title: string, key: string, type: string) {
  return `${title} (${key} [${type}])`;
}

export function formatModelProviderLabel(provider: ModelProvider | string): string {
  const normalized = String(provider).toLowerCase();
  if (normalized === 'ollama' || normalized === 'custom-llm' || normalized === 'custom_llm') {
    return 'Custom LLM / Ollama';
  }
  if (normalized === 'gemini' || normalized === 'google-gemini') {
    return 'Google Gemini';
  }
  const match = MODEL_PROVIDER_OPTIONS.find((p) => p.key === normalized);
  if (match) return match.label;
  const trimmed = String(provider).trim();
  if (!trimmed) return 'Not set';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function normalizeModelProviderKey(provider: string | null | undefined): ModelProvider {
  const normalized = String(provider ?? 'openai')
    .toLowerCase()
    .replace(/\s+/g, '-');
  if (normalized === 'custom-llm' || normalized === 'custom_llm') return 'ollama';
  if (normalized === 'gemini' || normalized === 'google' || normalized === 'google-gemini') {
    return 'google-gemini';
  }
  return normalized as ModelProvider;
}

function providerLookupKeys(providerKey: ModelProvider | string): string[] {
  const key = String(providerKey).toLowerCase();
  if (key === 'google-gemini' || key === 'gemini') {
    return ['google-gemini', 'gemini'];
  }
  if (key === 'ollama' || key === 'custom-llm') {
    return ['ollama', 'custom-llm'];
  }
  return [key];
}

/** Ensure the current selection stays in the option list (prevents auto-reset data loss). */
export function ensureModelOptionPresent(
  options: { key: string; label: string }[],
  selectedKey: string | null | undefined,
): { key: string; label: string }[] {
  const key = (selectedKey ?? '').trim();
  if (!key) return options;
  if (options.some((m) => m.key === key)) return options;
  return [...options, { key, label: key }];
}

export function resolveProviderOptions(available: AvailableSearchModels | null | undefined) {
  if (available?.providers?.length) {
    return available.providers.map((p) => ({
      key: normalizeModelProviderKey(p.key) as ModelProvider,
      label: p.label,
    }));
  }
  return MODEL_PROVIDER_OPTIONS;
}

export function resolveChatModelsForProvider(
  provider: ModelProvider | string,
  available: AvailableSearchModels | null | undefined,
  selectedChatModel?: string | null,
) {
  const providerKey = normalizeModelProviderKey(String(provider));
  let fromApi: { key: string; label: string }[] | undefined;
  for (const lookup of providerLookupKeys(providerKey)) {
    fromApi = available?.chatModelsByProvider?.[lookup];
    if (fromApi?.length) break;
  }
  const base = fromApi?.length ? fromApi : getChatModelsForProvider(providerKey);
  return ensureModelOptionPresent(base, selectedChatModel);
}

export function resolveEmbeddingModelOptions(
  provider: ModelProvider | string,
  available: AvailableSearchModels | null | undefined,
  selectedEmbeddingModel?: string | null,
) {
  const providerKey = normalizeModelProviderKey(String(provider));
  let fromApi: { key: string; label: string }[] | undefined;
  for (const lookup of providerLookupKeys(providerKey)) {
    fromApi = available?.embeddingModelsByProvider?.[lookup];
    if (fromApi?.length) break;
  }
  let base: { key: string; label: string }[];
  if (fromApi?.length) {
    base = fromApi;
  } else if (providerKey === 'ollama' || providerKey === 'openai') {
    base = EMBEDDING_MODEL_OPTIONS.filter((m) => m.key.includes('jina'));
  } else if (providerKey === 'mistral') {
    base = EMBEDDING_MODEL_OPTIONS.filter((m) => m.key === 'mistral-embed');
  } else if (providerKey === 'google-gemini') {
    base = EMBEDDING_MODEL_OPTIONS.filter((m) => m.key === 'gemini-embedding-001');
  } else {
    base = EMBEDDING_MODEL_OPTIONS;
  }
  return ensureModelOptionPresent(base, selectedEmbeddingModel);
}
