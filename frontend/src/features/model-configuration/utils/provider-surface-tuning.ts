import type {
  ModelProviderKey,
  ProviderConfigResponse,
  ProviderConfigSavePayload,
  ProviderSurfaceTuning,
  SurfaceTuning,
  SurfaceTuningDraft,
  TuningSurface,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  CHAT_RETRIEVAL_LIMITS,
  clampToRange,
  effectiveChatMaxTokens,
  effectiveSearchMaxTokens,
  SEARCH_RETRIEVAL_LIMITS,
  type SliderRange,
} from '@/shared/constants/widget-retrieval-limits';

export const TUNING_SURFACES: readonly TuningSurface[] = ['chat', 'search'];

export const DEFAULT_TEMPERATURE = 0.7;

/** Widgets fall back to this threshold before clamping when none is saved. */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.5;

export const TEMPERATURE_STEP = 0.1;

/** Anthropic and Mistral reject temperatures above 1; the others accept up to 2. */
const MAX_TEMPERATURE: Record<ModelProviderKey, number> = {
  openai: 2,
  anthropic: 1,
  mistral: 1,
  gemini: 2,
  ollama: 2,
};

export function maxTemperatureFor(provider: ModelProviderKey): number {
  return MAX_TEMPERATURE[provider];
}

export function resolveTemperature(provider: ModelProviderKey, saved: number | null): number {
  const value = saved ?? DEFAULT_TEMPERATURE;
  return Math.min(Math.max(value, 0), maxTemperatureFor(provider));
}

export const SIMILARITY_THRESHOLD_LIMITS: Record<TuningSurface, SliderRange> = {
  chat: CHAT_RETRIEVAL_LIMITS.similarityThreshold,
  search: SEARCH_RETRIEVAL_LIMITS.similarityThreshold,
};

/** Search widgets narrow this further for short answers. */
export const MAX_TOKENS_LIMITS: Record<TuningSurface, SliderRange> = {
  chat: CHAT_RETRIEVAL_LIMITS.maxTokens,
  search: SEARCH_RETRIEVAL_LIMITS.maxTokens.long,
};

function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

/** Older servers only send the shared `temperature`; it applies to both surfaces. */
export function mapSurfaceTuning(raw: ProviderConfigResponse | undefined): ProviderSurfaceTuning {
  const legacyTemperature = parseNumber(raw?.temperature);
  const mapSurface = (surface: TuningSurface): SurfaceTuning => {
    const values = raw?.surfaces?.[surface];
    return {
      temperature: parseNumber(values?.temperature) ?? legacyTemperature,
      similarityThreshold: parseNumber(values?.similarity_threshold),
      maxTokens: parseNumber(values?.max_tokens),
    };
  };
  return { chat: mapSurface('chat'), search: mapSurface('search') };
}

/** Slider steps accumulate float noise (0.30000000000000004); the server stores what it gets. */
export function roundDecimal(value: number): number {
  return Math.round(value * 100) / 100;
}

function resolveMaxTokens(surface: TuningSurface, saved: number | null): number {
  return surface === 'chat' ? effectiveChatMaxTokens(saved) : effectiveSearchMaxTokens(saved, 'long');
}

/** Slider values for one surface: saved values clamped, gaps filled with widget defaults. */
export function resolveSurfaceTuningDraft(
  provider: ModelProviderKey,
  surface: TuningSurface,
  saved: SurfaceTuning,
): SurfaceTuningDraft {
  return {
    temperature: resolveTemperature(provider, saved.temperature),
    similarityThreshold: clampToRange(
      saved.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD,
      SIMILARITY_THRESHOLD_LIMITS[surface],
    ),
    maxTokens: resolveMaxTokens(surface, saved.maxTokens),
  };
}

export function buildSurfaceTuningDrafts(
  provider: ModelProviderKey,
  surfaces: ProviderSurfaceTuning,
): Record<TuningSurface, SurfaceTuningDraft> {
  return {
    chat: resolveSurfaceTuningDraft(provider, 'chat', surfaces.chat),
    search: resolveSurfaceTuningDraft(provider, 'search', surfaces.search),
  };
}

type SurfaceTuningPayload = Pick<
  ProviderConfigSavePayload,
  | 'chat_temperature'
  | 'search_temperature'
  | 'chat_similarity_threshold'
  | 'search_similarity_threshold'
  | 'chat_max_tokens'
  | 'search_max_tokens'
>;

export function buildSurfaceTuningPayload(
  provider: ModelProviderKey,
  drafts: Record<TuningSurface, SurfaceTuningDraft>,
): SurfaceTuningPayload {
  const chat = resolveSurfaceTuningDraft(provider, 'chat', drafts.chat);
  const search = resolveSurfaceTuningDraft(provider, 'search', drafts.search);
  return {
    chat_temperature: roundDecimal(chat.temperature),
    search_temperature: roundDecimal(search.temperature),
    chat_similarity_threshold: roundDecimal(chat.similarityThreshold),
    search_similarity_threshold: roundDecimal(search.similarityThreshold),
    chat_max_tokens: Math.round(chat.maxTokens),
    search_max_tokens: Math.round(search.maxTokens),
  };
}
